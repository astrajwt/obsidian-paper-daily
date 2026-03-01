import type { App } from "obsidian";
import type { PaperDailySettings } from "../types/config";
import type { Paper } from "../types/paper";
import { VaultWriter } from "../storage/vaultWriter";
import { StateStore } from "../storage/stateStore";
import { DedupStore } from "../storage/dedupStore";
import { SnapshotStore } from "../storage/snapshotStore";
import { ArxivSource } from "../sources/arxivSource";
import { HFSource } from "../sources/hfSource";
import { rankPapers } from "../scoring/rank";
import { computeInterestHits } from "../scoring/interest";
import { downloadPapersForDay, readPaperPdfAsBase64 } from "../storage/paperDownloader";
import { OpenAICompatibleProvider } from "../llm/openaiCompatible";
import { AnthropicProvider } from "../llm/anthropicProvider";
import type { LLMProvider } from "../llm/provider";
import type { HFTrackStore } from "../storage/hfTrackStore";
import { DEFAULT_DEEP_READ_PROMPT, DEFAULT_SCORING_PROMPT } from "../settings";

function getISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildLLMProvider(settings: PaperDailySettings): LLMProvider {
  if (settings.llm.provider === "anthropic") {
    return new AnthropicProvider(settings.llm.apiKey, settings.llm.model);
  }
  return new OpenAICompatibleProvider(settings.llm.baseUrl, settings.llm.apiKey, settings.llm.model);
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }
  return result;
}

function getActivePrompt(settings: PaperDailySettings): string {
  if (settings.promptLibrary && settings.activePromptId) {
    const tpl = settings.promptLibrary.find(t => t.id === settings.activePromptId);
    if (tpl) return tpl.prompt;
  }
  return settings.llm.dailyPromptTemplate; // fallback for existing users
}

function getActiveScoringPrompt(settings: PaperDailySettings): string {
  if (settings.promptLibrary && settings.activeScorePromptId) {
    const tpl = settings.promptLibrary.find(t => t.id === settings.activeScorePromptId);
    if (tpl) return tpl.prompt;
  }
  return settings.scoringPromptTemplate ?? DEFAULT_SCORING_PROMPT;
}

function getActiveDeepReadPrompt(settings: PaperDailySettings): string {
  if (settings.promptLibrary && settings.activeDeepReadPromptId) {
    const tpl = settings.promptLibrary.find(t => t.id === settings.activeDeepReadPromptId);
    if (tpl) return tpl.prompt;
  }
  return settings.deepRead?.deepReadPromptTemplate ?? DEFAULT_DEEP_READ_PROMPT;
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/\r/g, "").trim();
}

function buildDailyMarkdown(
  date: string,
  settings: PaperDailySettings,
  rankedPapers: Paper[],
  aiDigest: string,
  activeSources: string[],
  error?: string
): string {
  const frontmatter = [
    "---",
    "type: paper-daily",
    `date: ${date}`,
    `sources: [${activeSources.join(", ")}]`,
    `categories: [${settings.categories.join(", ")}]`,
    `interestKeywords: [${settings.interestKeywords.map(k => `${k.keyword}(${k.weight})`).join(", ")}]`,
    "---"
  ].join("\n");

  const header = `# Paper Daily — ${date}`;

  const modelAttr = error ? "" : ` | by ${settings.llm.model} 老师 🤖`;
  const digestSection = error
    ? `## 今日要点（AI 总结）\n\n> **Error**: ${error}`
    : `## 今日要点（AI 总结）${modelAttr}\n\n${aiDigest}`;

  // ── All Papers Table ──────────────────────────────────────────
  const tableRows = rankedPapers.map((p, i) => {
    const titleLink = p.links.html
      ? `[${escapeTableCell(p.title)}](${p.links.html})`
      : escapeTableCell(p.title);
    const linkParts: string[] = [];
    if (p.links.html) linkParts.push(`[arXiv](${p.links.html})`);
    if (p.links.hf) linkParts.push(`[🤗 HF](${p.links.hf})`);
    if (settings.includePdfLink && p.links.pdf) linkParts.push(`[PDF](${p.links.pdf})`);
    if (p.links.localPdf) linkParts.push(`[Local PDF](${p.links.localPdf})`);
    const score = p.llmScore != null ? `⭐${p.llmScore}/10` : "-";
    const summary = escapeTableCell(p.llmSummary ?? "");
    const hits = (p.interestHits ?? []).slice(0, 3).join(", ") || "-";
    return `| ${i + 1} | ${titleLink} | ${linkParts.join(" ")} | ${score} | ${summary} | ${hits} |`;
  });
  const allPapersTableSection = [
    "## All Papers",
    "",
    "| # | Title | Links | Score | Summary | Hits |",
    "|---|-------|-------|-------|---------|------|",
    ...(tableRows.length > 0 ? tableRows : ["| — | _No papers_ | | | | |"])
  ].join("\n");

  const sections = [frontmatter, "", header, "", digestSection];
  sections.push("", allPapersTableSection);
  return sections.join("\n");
}

export interface DailyPipelineOptions {
  targetDate?: string;
  windowStart?: Date;
  windowEnd?: Date;
  skipDedup?: boolean;
  hfTrackStore?: HFTrackStore;
  /** Called at each major pipeline step with a human-readable status message */
  onProgress?: (msg: string) => void;
}

export async function runDailyPipeline(
  app: App,
  settings: PaperDailySettings,
  stateStore: StateStore,
  dedupStore: DedupStore,
  snapshotStore: SnapshotStore,
  options: DailyPipelineOptions = {}
): Promise<void> {
  const writer = new VaultWriter(app);
  const now = new Date();
  const date = options.targetDate ?? getISODate(now);
  const logPath = `${settings.rootFolder}/cache/runs.log`;
  const inboxPath = `${settings.rootFolder}/inbox/${date}.md`;
  const snapshotPath = `${settings.rootFolder}/papers/${date}.json`;

  const logLines: string[] = [];
  const log = (msg: string) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    logLines.push(line);
    console.log(`[PaperDaily] ${msg}`);
  };
  const progress = options.onProgress ?? (() => {});

  // Token usage accumulator
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const trackUsage = (label: string, inputTokens: number, outputTokens: number) => {
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    log(`${label} tokens: input=${inputTokens} output=${outputTokens}`);
  };

  log(`=== Daily pipeline START date=${date} ===`);

  const interestKeywords = settings.interestKeywords ?? [];
  log(`Settings: categories=[${settings.categories.join(",")}] interestKeywords=${interestKeywords.length} fetchMode=${settings.fetchMode ?? "all"}`);

  let papers: Paper[] = [];
  let hfDailyPapers: Paper[] = [];
  let fetchError: string | undefined;
  let llmDigest = "";
  let llmError: string | undefined;
  const activeSources: string[] = [];

  // ── Step 1: Fetch arXiv ───────────────────────────────────────
  progress(`[1/5] 📡 拉取 arXiv 论文...`);
  let fetchUrl = "";
  try {
    const source = new ArxivSource();
    const windowEnd = options.windowEnd ?? now;
    const windowStart = options.windowStart ?? new Date(windowEnd.getTime() - (settings.timeWindowHours ?? 72) * 3600 * 1000);
    fetchUrl = source.buildUrl(
      { categories: settings.categories, keywords: [], maxResults: 200, sortBy: "submittedDate", windowStart, windowEnd },
      200
    );
    log(`Step 1 FETCH: url=${fetchUrl}`);
    papers = await source.fetch({
      categories: settings.categories,
      keywords: [],
      maxResults: 200,
      sortBy: "submittedDate",
      windowStart,
      windowEnd,
      targetDate: date
    });
    log(`Step 1 FETCH: got ${papers.length} papers`);
    if (papers.length > 0) {
      log(`Step 1 FETCH: first="${papers[0].title.slice(0, 80)}" published=${papers[0].published.slice(0, 10)}`);
      activeSources.push("arxiv");
    }
  } catch (err) {
    fetchError = String(err);
    log(`Step 1 FETCH ERROR: ${fetchError}`);
    await stateStore.setLastError("fetch", fetchError);
  }

  // ── Step 1b: Fetch HuggingFace Papers ─────────────────────────
  if (settings.hfSource?.enabled !== false) {
    progress(`[1/5] 🤗 拉取 HuggingFace 论文...`);
    try {
      const hfSource = new HFSource();
      const lookback = settings.hfSource?.lookbackDays ?? 3;
      let hfFetchDate = date;

      // Try today first; if empty (e.g. weekend/holiday), look back up to lookbackDays
      for (let d = 0; d <= lookback; d++) {
        const tryDate = d === 0 ? date
          : getISODate(new Date(new Date(date + "T12:00:00Z").getTime() - d * 86400000));
        const fetched = await hfSource.fetchForDate(tryDate);
        if (fetched.length > 0) {
          hfDailyPapers = fetched;
          hfFetchDate = tryDate;
          break;
        }
      }
      log(`Step 1b HF FETCH: got ${hfDailyPapers.length} papers (date=${hfFetchDate}${hfFetchDate !== date ? `, lookback from ${date}` : ""})`);

      if (hfDailyPapers.length > 0) {
        activeSources.push("huggingface");

        // Track appearances + compute streak; apply dedup if configured
        if (options.hfTrackStore) {
          for (const p of hfDailyPapers) {
            p.hfStreak = options.hfTrackStore.track(p.id, p.title, hfFetchDate);
          }
          await options.hfTrackStore.save();
          if (settings.hfSource?.dedup) {
            const before = hfDailyPapers.length;
            hfDailyPapers = hfDailyPapers.filter(p => !options.hfTrackStore!.seenBefore(p.id, hfFetchDate));
            log(`Step 1b HF DEDUP: ${before} → ${hfDailyPapers.length} papers (removed ${before - hfDailyPapers.length} previously seen)`);
          }
        }

        // Enrich arXiv papers that also appear on HF with upvotes + HF link.
        const hfByBaseId = new Map<string, Paper>();
        for (const hfp of hfDailyPapers) {
          hfByBaseId.set(hfp.id, hfp);
        }
        let enrichedCount = 0;
        const arxivBaseIds = new Set(
          papers.map(p => `arxiv:${p.id.replace(/^arxiv:/i, "").replace(/v\d+$/i, "")}`)
        );
        for (const p of papers) {
          const baseId = `arxiv:${p.id.replace(/^arxiv:/i, "").replace(/v\d+$/i, "")}`;
          const hfMatch = hfByBaseId.get(baseId);
          if (hfMatch) {
            p.hfUpvotes = hfMatch.hfUpvotes ?? 0;
            if (hfMatch.links.hf) p.links = { ...p.links, hf: hfMatch.links.hf };
            enrichedCount++;
          }
        }
        log(`Step 1b HF MERGE: enriched ${enrichedCount}/${papers.length} arXiv papers with HF upvotes`);

        // Add HF-only papers (not in arXiv results) to main scoring pool
        const hfOnlyPapers = hfDailyPapers.filter(p => !arxivBaseIds.has(p.id));
        if (hfOnlyPapers.length > 0) {
          papers.push(...hfOnlyPapers);
          log(`Step 1b HF MERGE: added ${hfOnlyPapers.length} HF-only papers to scoring pool`);
        }
      }
    } catch (err) {
      log(`Step 1b HF FETCH ERROR: ${String(err)} (non-fatal, continuing)`);
    }
  } else {
    log(`Step 1b HF FETCH: skipped (disabled)`);
  }

  // ── Step 2: Dedup ─────────────────────────────────────────────
  const countBeforeDedup = papers.length;
  const dedupEnabled = (settings.dedup ?? true) && !options.skipDedup;
  if (dedupEnabled && papers.length > 0) {
    papers = papers.filter(p => !dedupStore.hasId(p.id));
  }
  log(`Step 2 DEDUP: before=${countBeforeDedup} after=${papers.length} (filtered=${countBeforeDedup - papers.length}${dedupEnabled ? "" : ", dedup disabled"})`);

  // ── Step 2b: Interest-only filter ────────────────────────────
  if ((settings.fetchMode ?? "all") === "interest_only" && interestKeywords.length > 0) {
    // Pre-score interest hits so the filter can use them
    for (const p of papers) {
      p.interestHits = computeInterestHits(p, interestKeywords);
    }
    const before = papers.length;
    papers = papers.filter(p => (p.interestHits ?? []).length > 0);
    log(`Step 2b INTEREST FILTER: ${before} → ${papers.length} papers (removed ${before - papers.length} with no keyword hits)`);
  }

  // ── Step 3: Score + rank ──────────────────────────────────────
  let rankedPapers = papers.length > 0
    ? rankPapers(papers, interestKeywords)
    : [];
  log(`Step 3 RANK: ${rankedPapers.length} papers ranked`);

  // ── Step 3b: LLM scoring (batched, all papers) ───────────────
  if (rankedPapers.length > 0 && settings.llm.apiKey) {
    const BATCH_SIZE = 10;
    const totalBatches = Math.ceil(rankedPapers.length / BATCH_SIZE);
    const scoringTemplate = getActiveScoringPrompt(settings);
    const kwStr = interestKeywords.map(k => `${k.keyword}(weight:${k.weight})`).join(", ");
    const normalizeId = (id: string) => id.replace(/^arxiv:/i, "").replace(/v\d+$/i, "").toLowerCase().trim();
    const llm = buildLLMProvider(settings);
    let totalScored = 0;

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batchStart = batchIdx * BATCH_SIZE;
      const batchPapers = rankedPapers.slice(batchStart, batchStart + BATCH_SIZE);
      const paperFrom = batchStart + 1;
      const paperTo = batchStart + batchPapers.length;
      const paperTotal = rankedPapers.length;
      progress(`[2/5] 🔍 快速预筛 (${paperFrom}–${paperTo} / ${paperTotal} 篇)...`);

      const papersForScoring = batchPapers.map(p => ({
        id: p.id,
        title: p.title,
        abstract: p.abstract.slice(0, 250),
        interestHits: p.interestHits ?? [],
        ...(p.hfUpvotes ? { hfUpvotes: p.hfUpvotes } : {})
      }));
      const batchMaxTokens = Math.min(batchPapers.length * 150 + 256, 8192);
      const scoringPrompt = fillTemplate(scoringTemplate, {
        interest_keywords: kwStr,
        papers_json: JSON.stringify(papersForScoring)
      });

      try {
        const result = await llm.generate({ prompt: scoringPrompt, temperature: 0.1, maxTokens: batchMaxTokens });
        if (result.usage) trackUsage(`Step 3b scoring batch ${batchIdx + 1}`, result.usage.inputTokens, result.usage.outputTokens);
        const jsonMatch = result.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const scores: Array<{ id: string; score: number; reason: string; summary?: string }> = JSON.parse(jsonMatch[0]);
          const scoreMap = new Map(scores.map(s => [normalizeId(s.id), s]));
          let matched = 0;
          for (const paper of batchPapers) {
            const s = scoreMap.get(normalizeId(paper.id));
            if (s) {
              paper.llmScore = s.score;
              paper.llmScoreReason = s.reason;
              if (s.summary) paper.llmSummary = s.summary;
              matched++;
            }
          }
          totalScored += matched;
          log(`Step 3b batch ${batchIdx + 1}/${totalBatches}: scored ${matched}/${batchPapers.length} (LLM returned ${scores.length})`);
          if (matched === 0 && scores.length > 0) {
            log(`Step 3b batch ${batchIdx + 1} WARNING: 0 matched — ID mismatch? LLM="${scores[0]?.id}" vs paper="${batchPapers[0]?.id}"`);
          }
        } else {
          log(`Step 3b batch ${batchIdx + 1}: could not parse JSON (response length=${result.text.length})`);
        }
      } catch (err) {
        log(`Step 3b batch ${batchIdx + 1} ERROR: ${String(err)} (non-fatal, continuing)`);
      }
    }

    // Re-rank all papers by LLM score; unscored papers fall to the end
    rankedPapers.sort((a, b) => (b.llmScore ?? -1) - (a.llmScore ?? -1));
    log(`Step 3b LLM SCORE: done — ${totalScored}/${rankedPapers.length} papers scored across ${totalBatches} batch(es), re-ranked`);
  } else {
    log(`Step 3b LLM SCORE: skipped (${rankedPapers.length === 0 ? "0 papers" : "no API key"})`);
  }

  // ── Step 3d: Download full text (ranked papers) ───────────────
  if (rankedPapers.length > 0) {
    await downloadPapersForDay(app, rankedPapers, settings, log, date);
  }

  // ── Step 3f: Deep Read — per-paper LLM analysis via arxiv HTML URL ───
  let fulltextSection = "";
  if (settings.deepRead?.enabled && rankedPapers.length > 0 && settings.llm.apiKey) {
    const topN      = Math.min(settings.deepRead.topN ?? 5, rankedPapers.length);
    const maxTokens = settings.deepRead.deepReadMaxTokens ?? 1024;
    const drPrompt  = getActiveDeepReadPrompt(settings);
    const langStr   = settings.language === "zh" ? "Chinese (中文)" : "English";

    progress(`[3/5] 📖 Deep Read — 共 ${topN} 篇...`);
    const llm = buildLLMProvider(settings);
    const analysisResults: string[] = [];

    for (let i = 0; i < topN; i++) {
      progress(`[3/5] 📖 Deep Read (${i + 1}/${topN})...`);
      const paper  = rankedPapers[i];
      const baseId = paper.id.replace(/^arxiv:/i, "").replace(/v\d+$/i, "");
      const htmlUrl = `https://arxiv.org/html/${baseId}`;

      log(`Step 3f DEEPREAD [${i + 1}/${topN}]: ${baseId} → ${htmlUrl}`);

      // Build per-paper prompt — pass the arxiv HTML URL so the LLM can read it directly
      const arxivUrl = `https://arxiv.org/abs/${baseId}`;
      const paperPrompt = fillTemplate(drPrompt, {
        title:         paper.title,
        authors:       (paper.authors ?? []).slice(0, 5).join(", ") || "Unknown",
        published:     paper.published ? paper.published.slice(0, 10) : date,
        arxiv_url:     arxivUrl,
        interest_hits: (paper.interestHits ?? []).join(", ") || "none",
        abstract:      paper.abstract,
        fulltext:      htmlUrl,
        language:      langStr,
      });

      // LLM call — non-fatal
      try {
        const result = await llm.generate({ prompt: paperPrompt, temperature: 0.2, maxTokens });
        if (result.usage) trackUsage(`Step 3f deepread [${i + 1}]`, result.usage.inputTokens, result.usage.outputTokens);
        paper.deepReadAnalysis = result.text.trim();
        analysisResults.push(`### [${i + 1}] ${paper.title}\n\n${paper.deepReadAnalysis}`);
        log(`Step 3f DEEPREAD [${i + 1}/${topN}]: done (${result.text.length} chars)`);

        // Write per-paper standalone markdown file
        try {
          const outputFolder = settings.deepRead?.outputFolder ?? "PaperDaily/deep-read";
          const fileTags = [
            ...(settings.deepRead?.tags ?? ["paper", "deep-read"]),
            ...(paper.interestHits ?? []).map(h => h.replace(/\s+/g, "-"))
          ];
          const safeId = baseId.replace(/[^a-zA-Z0-9._-]/g, "_");
          const paperFrontmatter = [
            "---",
            `type: deep-read`,
            `title: "${paper.title.replace(/"/g, '\\"')}"`,
            `date: ${date}`,
            `arxivId: ${baseId}`,
            `arxivUrl: ${arxivUrl}`,
            `authors: [${(paper.authors ?? []).slice(0, 5).map(a => `"${a.replace(/"/g, '\\"')}"`).join(", ")}]`,
            `published: ${paper.published ? paper.published.slice(0, 10) : date}`,
            `tags: [${fileTags.map(t => `"${t}"`).join(", ")}]`,
            ...(paper.llmScore != null ? [`llmScore: ${paper.llmScore}`] : []),
            "---",
          ].join("\n");

          const paperMd = `${paperFrontmatter}\n\n# ${paper.title}\n\n${paper.deepReadAnalysis}\n`;
          await writer.writeNote(`${outputFolder}/${safeId}.md`, paperMd);
          log(`Step 3f DEEPREAD [${i + 1}/${topN}]: wrote ${outputFolder}/${safeId}.md`);
        } catch (writeErr) {
          log(`Step 3f DEEPREAD [${i + 1}/${topN}]: failed to write per-paper file: ${String(writeErr)}`);
        }
      } catch (err) {
        log(`Step 3f DEEPREAD [${i + 1}/${topN}]: LLM error: ${String(err)} — skipping`);
      }
    }

    if (analysisResults.length > 0) {
      fulltextSection = [
        "",
        `## Deep Read Analysis (top ${analysisResults.length} papers)`,
        `> Per-paper LLM analysis — model reads full paper from arxiv.org/html directly.`,
        "",
        analysisResults.join("\n\n---\n\n"),
      ].join("\n");
    }
    log(`Step 3f DEEPREAD: ${analysisResults.length}/${topN} papers analysed`);
  } else {
    log(`Step 3f DEEPREAD: skipped (enabled=${settings.deepRead?.enabled ?? false})`);
  }

  // ── Step 4: LLM ───────────────────────────────────────────────
  if (rankedPapers.length > 0 && settings.llm.apiKey) {
    progress(`[4/5] 📝 正在生成日报...`);
    log(`Step 4 LLM: provider=${settings.llm.provider} model=${settings.llm.model}`);
    try {
      const llm = buildLLMProvider(settings);
      const topK = Math.min(rankedPapers.length, 10);
      const topPapersForLLM = rankedPapers.slice(0, topK).map(p => ({
        id: p.id,
        title: p.title,
        abstract: p.abstract.slice(0, 500),
        categories: p.categories,
        interestHits: p.interestHits ?? [],
        ...(p.hfUpvotes ? { hfUpvotes: p.hfUpvotes } : {}),
        source: p.source,
        published: p.published,
        updated: p.updated,
        links: p.links
      }));
      const hfForLLM = hfDailyPapers.slice(0, 15).map(p => ({
        title: p.title,
        hfUpvotes: p.hfUpvotes ?? 0,
        ...(p.hfStreak && p.hfStreak > 1 ? { streakDays: p.hfStreak } : {})
      }));

      const prompt = fillTemplate(getActivePrompt(settings), {
        date,
        papers_json: JSON.stringify(topPapersForLLM, null, 2),
        hf_papers_json: JSON.stringify(hfForLLM, null, 2),
        fulltext_section: fulltextSection,
        local_pdfs: "",
        interest_keywords: interestKeywords.map(k => `${k.keyword}(weight:${k.weight})`).join(", "),
        language: settings.language === "zh" ? "Chinese (中文)" : "English"
      });
      const result = await llm.generate({ prompt, temperature: settings.llm.temperature, maxTokens: settings.llm.maxTokens });
      llmDigest = result.text;
      if (result.usage) trackUsage("Step 4 digest", result.usage.inputTokens, result.usage.outputTokens);
      log(`Step 4 LLM: success, response length=${llmDigest.length} chars`);
    } catch (err) {
      llmError = String(err);
      log(`Step 4 LLM ERROR: ${llmError}`);
      await stateStore.setLastError("llm", llmError);
    }
  } else if (!settings.llm.apiKey) {
    llmError = "LLM API key not configured";
    log(`Step 4 LLM: skipped (no API key)`);
  } else {
    log(`Step 4 LLM: skipped (0 papers)`);
  }

  // ── Step 5: Write markdown ────────────────────────────────────
  const errorMsg = fetchError
    ? `Fetch failed: ${fetchError}${llmError ? `\n\nLLM failed: ${llmError}` : ""}`
    : llmError ? `LLM failed: ${llmError}` : undefined;

  progress(`[5/5] 💾 写入文件...`);
  try {
    const markdown = buildDailyMarkdown(date, settings, rankedPapers, llmDigest, activeSources, errorMsg);
    await writer.writeNote(inboxPath, markdown);
    log(`Step 5 WRITE: markdown written to ${inboxPath}`);
  } catch (err) {
    log(`Step 5 WRITE ERROR: ${String(err)}`);
    await stateStore.setLastError("write", String(err));
    throw err;
  }

  // ── Step 6: Write snapshot ────────────────────────────────────
  await snapshotStore.writeSnapshot(date, rankedPapers, fetchError);
  log(`Step 6 SNAPSHOT: written to ${snapshotPath} (${rankedPapers.length} papers)`);

  // ── Step 7: Update dedup ──────────────────────────────────────
  if (dedupEnabled && rankedPapers.length > 0) {
    await dedupStore.markSeenBatch(rankedPapers.map(p => p.id), date);
    log(`Step 7 DEDUP: marked ${rankedPapers.length} IDs as seen`);
  }

  // ── Step 8: Update state ──────────────────────────────────────
  if (!options.targetDate) {
    await stateStore.setLastDailyRun(now.toISOString());
  }

  log(`=== Daily pipeline END date=${date} papers=${rankedPapers.length} ===`);

  // ── Emit final progress summary ───────────────────────────────
  const tokenSummary = totalInputTokens > 0
    ? ` | tokens: ${totalInputTokens.toLocaleString()}→${totalOutputTokens.toLocaleString()}`
    : "";
  progress(`✅ 完成！${rankedPapers.length} 篇论文${tokenSummary}`);

  // ── Flush log ─────────────────────────────────────────────────
  await writer.appendToNote(logPath, logLines.join("\n") + "\n");
}
