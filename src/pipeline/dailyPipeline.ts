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

/** Build a safe filename (no extension) for a deep-read note using the configured template. */
function buildDeepReadFileName(
  template: string,
  paper: Paper,
  baseId: string,
  date: string,
  modelName: string
): string {
  const safeStr = (s: string, maxLen = 60) =>
    s.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, maxLen);

  const [year, month, day] = date.split("-");
  // Use just the last path segment of the model name (e.g. "deepseek/deepseek-chat" → "deepseek-chat")
  const modelShort = modelName.split("/").pop() ?? modelName;

  const vars: Record<string, string> = {
    title:   safeStr(paper.title),
    arxivId: baseId,
    date,
    model:   safeStr(modelShort, 40),
    year,
    month,
    day,
  };

  let result = template;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }
  // Final sanitize: strip remaining invalid chars, collapse dashes
  return result.replace(/[/\\:*?"<>|]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || baseId;
}

function buildDailyMarkdown(
  date: string,
  settings: PaperDailySettings,
  rankedPapers: Paper[],
  aiDigest: string,
  activeSources: string[],
  interestHotnessSection: string,
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
  const deepReadFolder = settings.deepRead?.outputFolder ?? "PaperDaily/deep-read";
  const fnTemplate = settings.deepRead?.fileNameTemplate?.trim() || "{{title}}-deep-read-{{model}}";

  // Featured Papers (deep-read subset)
  const deepReadPapers = rankedPapers.filter(p => p.deepReadAnalysis);
  let featuredPapersSection = "";
  if (deepReadPapers.length > 0) {
    const featRows = deepReadPapers.map((p, i) => {
      const baseId = p.id.replace(/^arxiv:/i, "").replace(/v\d+$/i, "");
      const fileName = buildDeepReadFileName(fnTemplate, p, baseId, date, settings.llm.model);
      const titleLink = p.links.html
        ? `[${escapeTableCell(p.title)}](${p.links.html})`
        : escapeTableCell(p.title);
      const score = p.llmScore != null ? `⭐${p.llmScore}/10` : "-";
      const hits = (p.interestHits ?? []).slice(0, 3).join(", ") || "-";
      const drLink = `[[${deepReadFolder}/${date}/${fileName}\\|Deep Read]]`;
      return `| ${i + 1} | ${titleLink} | ${score} | ${hits} | ${drLink} |`;
    });
    featuredPapersSection = [
      `## 精选论文 / Featured Papers (${deepReadPapers.length})`,
      "",
      "> 以下论文已完成全文精读，点击 Deep Read 查看详细分析。",
      "",
      "| # | Title | Score | Hits | Deep Read |",
      "|---|-------|-------|------|-----------|",
      ...featRows
    ].join("\n");
  }

  const tableRows = rankedPapers.map((p, i) => {
    const titleLink = p.links.html
      ? `[${escapeTableCell(p.title)}](${p.links.html})`
      : escapeTableCell(p.title);
    const linkParts: string[] = [];
    if (p.links.html) linkParts.push(`[arXiv](${p.links.html})`);
    if (p.links.hf) linkParts.push(`[🤗 HF](${p.links.hf})`);
    if (settings.includePdfLink && p.links.pdf) linkParts.push(`[PDF](${p.links.pdf})`);
    if (p.deepReadAnalysis) {
      const baseId = p.id.replace(/^arxiv:/i, "").replace(/v\d+$/i, "");
      const fileName = buildDeepReadFileName(fnTemplate, p, baseId, date, settings.llm.model);
      linkParts.push(`[[${deepReadFolder}/${date}/${fileName}\\|Deep Read]]`);
    }
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

  const sections = [frontmatter, "", header];
  if (interestHotnessSection) sections.push("", interestHotnessSection);
  sections.push("", digestSection);
  if (featuredPapersSection) sections.push("", featuredPapersSection);
  sections.push("", allPapersTableSection);
  return sections.join("\n");
}

export class PipelineAbortError extends Error {
  constructor() { super("Pipeline aborted by user"); this.name = "PipelineAbortError"; }
}

export interface DailyPipelineOptions {
  targetDate?: string;
  windowStart?: Date;
  windowEnd?: Date;
  skipDedup?: boolean;
  hfTrackStore?: HFTrackStore;
  /** Called at each major pipeline step with a human-readable status message */
  onProgress?: (msg: string) => void;
  /** Called after each LLM call with cumulative token counts */
  onTokenUpdate?: (inputTokens: number, outputTokens: number) => void;
  /** Abort signal — throw PipelineAbortError when aborted */
  signal?: AbortSignal;
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
  const checkAbort = () => {
    if (options.signal?.aborted) throw new PipelineAbortError();
  };

  // Token usage accumulator
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const SINGLE_CALL_TOKEN_WARN = 20_000;
  const TOTAL_TOKEN_WARN = 50_000;
  const trackUsage = (label: string, inputTokens: number, outputTokens: number) => {
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    log(`${label} tokens: input=${inputTokens} output=${outputTokens}`);
    if (inputTokens > SINGLE_CALL_TOKEN_WARN) {
      log(`[WARN][TOKEN] ${label} single-call input=${inputTokens} exceeds threshold (${SINGLE_CALL_TOKEN_WARN}) — check prompt size`);
    }
    options.onTokenUpdate?.(totalInputTokens, totalOutputTokens);
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
    log(`[ERROR][FETCH] url=${fetchUrl} error=${fetchError}`);
    await stateStore.setLastError("fetch", fetchError);
  }

  // ── Step 1b: Fetch HuggingFace Papers ─────────────────────────
  checkAbort();
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
      log(`[ERROR][HF_FETCH] error=${String(err)} (non-fatal, continuing)`);
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
  checkAbort();
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
      checkAbort();
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
        const result = await llm.generate({ prompt: scoringPrompt, temperature: 0.1, maxTokens: batchMaxTokens, signal: options.signal });
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
        log(`[ERROR][SCORING] batch=${batchIdx + 1}/${totalBatches} error=${String(err)} (non-fatal, continuing)`);
      }
    }

    // Re-rank all papers by LLM score; unscored papers fall to the end
    rankedPapers.sort((a, b) => (b.llmScore ?? -1) - (a.llmScore ?? -1));
    log(`Step 3b LLM SCORE: done — ${totalScored}/${rankedPapers.length} papers scored across ${totalBatches} batch(es), re-ranked`);

    // ── Domain hotness summary ────────────────────────────────────
    const catStats = new Map<string, { count: number; totalScore: number; scored: number }>();
    for (const paper of rankedPapers) {
      for (const cat of (paper.categories ?? [])) {
        if (!catStats.has(cat)) catStats.set(cat, { count: 0, totalScore: 0, scored: 0 });
        const s = catStats.get(cat)!;
        s.count++;
        if (paper.llmScore != null) { s.totalScore += paper.llmScore; s.scored++; }
      }
    }
    const topCats = [...catStats.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10);
    const hotnessProgressStr = topCats.map(([cat, s]) =>
      `${cat} ${s.count}篇${s.scored > 0 ? ` avg${(s.totalScore / s.scored).toFixed(1)}` : ""}`
    ).join(" · ");
    progress(`📊 领域热度: ${hotnessProgressStr}`);
    log(`Step 3b DOMAIN HOTNESS: ${hotnessProgressStr}`);
  } else {
    log(`Step 3b LLM SCORE: skipped (${rankedPapers.length === 0 ? "0 papers" : "no API key"})`);
  }

  // ── Step 3f: Deep Read — per-paper LLM analysis via arxiv HTML URL ───
  let fulltextSection = "";
  if (settings.deepRead?.enabled && rankedPapers.length > 0 && settings.llm.apiKey) {
    const topN      = Math.min(settings.deepRead.topN ?? 10, rankedPapers.length);
    const maxTokens = settings.deepRead.deepReadMaxTokens ?? 1024;
    const drPrompt  = getActiveDeepReadPrompt(settings);
    const langStr   = settings.language === "zh" ? "Chinese (中文)" : "English";

    progress(`[3/5] 📖 Deep Read — 共 ${topN} 篇...`);
    const llm = buildLLMProvider(settings);
    const analysisResults: string[] = [];

    for (let i = 0; i < topN; i++) {
      checkAbort();
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
        const result = await llm.generate({ prompt: paperPrompt, temperature: 0.2, maxTokens, signal: options.signal });
        if (result.usage) trackUsage(`Step 3f deepread [${i + 1}]`, result.usage.inputTokens, result.usage.outputTokens);
        paper.deepReadAnalysis = result.text.trim();
        analysisResults.push(`### [${i + 1}] ${paper.title}\n\n${paper.deepReadAnalysis}`);
        log(`Step 3f DEEPREAD [${i + 1}/${topN}]: done (${result.text.length} chars)`);

        // Write per-paper standalone markdown file
        try {
          const outputFolder = `${settings.deepRead?.outputFolder ?? "PaperDaily/deep-read"}/${date}`;
          const fileTags = [
            ...(settings.deepRead?.tags ?? ["paper", "deep-read"]),
            ...(paper.interestHits ?? []).map(h => h.replace(/\s+/g, "-"))
          ];
          const fnTemplate = settings.deepRead?.fileNameTemplate?.trim() || "{{title}}-deep-read-{{model}}";
          const fileName = buildDeepReadFileName(fnTemplate, paper, baseId, date, settings.llm.model);
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
          await writer.writeNote(`${outputFolder}/${fileName}.md`, paperMd);
          log(`Step 3f DEEPREAD [${i + 1}/${topN}]: wrote ${outputFolder}/${fileName}.md`);
        } catch (writeErr) {
          log(`[ERROR][DEEP_READ_WRITE] paper=${i + 1}/${topN} id=${baseId} error=${String(writeErr)}`);
        }
      } catch (err) {
        log(`[ERROR][DEEP_READ] paper=${i + 1}/${topN} id=${baseId} error=${String(err)} — skipping`);
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
  checkAbort();
  if (rankedPapers.length > 0 && settings.llm.apiKey) {
    progress(`[4/5] 📝 正在生成日报...`);
    log(`Step 4 LLM: provider=${settings.llm.provider} model=${settings.llm.model}`);
    try {
      const llm = buildLLMProvider(settings);
      const topK = Math.min(rankedPapers.length, 20);
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

      const hfEnabled = settings.hfSource?.enabled !== false && hfDailyPapers.length > 0;
      const hfDataSection = hfEnabled
        ? `Note: papers with "source": "hf" are HuggingFace-only picks. Treat them identically to arXiv papers.\n\n## HuggingFace Daily Papers (full list for reference, sorted by upvotes):\n${JSON.stringify(hfForLLM, null, 2)}`
        : "";
      const hfSignalSection = hfEnabled
        ? `### HF 社区信号 / HF Community Signal\nFrom the HuggingFace full list, note any papers NOT already covered above. One line each: title + why the community is upvoting it + your take on whether it lives up to the hype.`
        : "";

      const prompt = fillTemplate(getActivePrompt(settings), {
        date,
        papers_json: JSON.stringify(topPapersForLLM, null, 2),
        hf_papers_json: JSON.stringify(hfForLLM, null, 2),
        hf_data_section: hfDataSection,
        hf_signal_section: hfSignalSection,
        fulltext_section: fulltextSection,
        local_pdfs: "",
        interest_keywords: interestKeywords.map(k => `${k.keyword}(weight:${k.weight})`).join(", "),
        language: settings.language === "zh" ? "Chinese (中文)" : "English"
      });
      const result = await llm.generate({ prompt, temperature: settings.llm.temperature, maxTokens: settings.llm.maxTokens, signal: options.signal });
      llmDigest = result.text;
      if (result.usage) trackUsage("Step 4 digest", result.usage.inputTokens, result.usage.outputTokens);
      log(`Step 4 LLM: success, response length=${llmDigest.length} chars`);
    } catch (err) {
      llmError = String(err);
      log(`[ERROR][LLM] provider=${settings.llm.provider} model=${settings.llm.model} error=${llmError}`);
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
    // Build interest area hotness section (based on user's interest keywords)
    let interestHotnessSection = "";
    if (interestKeywords.length > 0) {
      type AreaStat = { keyword: string; weight: number; count: number; totalScore: number; scored: number; topPaper?: Paper };
      const areaMap = new Map<string, AreaStat>();
      for (const kw of interestKeywords) {
        areaMap.set(kw.keyword, { keyword: kw.keyword, weight: kw.weight, count: 0, totalScore: 0, scored: 0 });
      }
      for (const paper of rankedPapers) {
        for (const hit of (paper.interestHits ?? [])) {
          const s = areaMap.get(hit);
          if (s) {
            s.count++;
            if (paper.llmScore != null) {
              s.totalScore += paper.llmScore;
              s.scored++;
              if (!s.topPaper || (paper.llmScore > (s.topPaper.llmScore ?? 0))) s.topPaper = paper;
            }
          }
        }
      }
      const hotAreas = [...areaMap.values()]
        .filter(s => s.count > 0)
        .sort((a, b) => {
          const hotA = (a.scored > 0 ? a.totalScore / a.scored : 5) * Math.log1p(a.count) * a.weight;
          const hotB = (b.scored > 0 ? b.totalScore / b.scored : 5) * Math.log1p(b.count) * b.weight;
          return hotB - hotA;
        });
      if (hotAreas.length > 0) {
        const hasScores = hotAreas.some(s => s.scored > 0);
        const rows = hotAreas.map(s => {
          const avgScore = s.scored > 0 ? (s.totalScore / s.scored).toFixed(1) : "-";
          const top = s.topPaper;
          const topTitle = top
            ? (top.links.html
              ? `[${escapeTableCell(top.title.slice(0, 45))}${top.title.length > 45 ? "…" : ""}](${top.links.html})`
              : escapeTableCell(top.title.slice(0, 45)))
            : "-";
          return hasScores
            ? `| ${s.keyword} | ${s.count} | ${avgScore} | ${topTitle} |`
            : `| ${s.keyword} | ${s.count} | ${topTitle} |`;
        });
        interestHotnessSection = [
          "## 今日兴趣领域热度",
          "",
          hasScores ? "| 关键词 | 命中论文 | 平均分 | 代表论文 |" : "| 关键词 | 命中论文 | 代表论文 |",
          hasScores ? "|--------|---------|--------|---------|" : "|--------|---------|---------|",
          ...rows
        ].join("\n");
      }
    }

    const markdown = buildDailyMarkdown(date, settings, rankedPapers, llmDigest, activeSources, interestHotnessSection, errorMsg);
    await writer.writeNote(inboxPath, markdown);
    log(`Step 5 WRITE: markdown written to ${inboxPath}`);
  } catch (err) {
    log(`[ERROR][WRITE] path=${inboxPath} error=${String(err)}`);
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

  // ── Token summary + anomaly warning ──────────────────────────
  if (totalInputTokens > 0) {
    log(`Token summary: totalInput=${totalInputTokens} totalOutput=${totalOutputTokens}`);
    if (totalInputTokens > TOTAL_TOKEN_WARN) {
      log(`[WARN][TOKEN] total run input=${totalInputTokens} exceeds ${TOTAL_TOKEN_WARN} — consider reducing deepRead.topN or disabling deep read`);
    }
  }

  // ── Emit final progress summary ───────────────────────────────
  const tokenSummary = totalInputTokens > 0
    ? ` | tokens: ${totalInputTokens.toLocaleString()}→${totalOutputTokens.toLocaleString()}`
    : "";
  progress(`✅ 完成！${rankedPapers.length} 篇论文${tokenSummary}`);

  // ── Flush log (with 10MB rotation) ────────────────────────────
  await writer.appendLogWithRotation(logPath, logLines.join("\n") + "\n", 10 * 1024 * 1024);
}
