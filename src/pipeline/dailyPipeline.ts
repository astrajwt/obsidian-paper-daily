import type { App } from "obsidian";
import type { PaperDailySettings, InterestKeyword } from "../types/config";
import type { Paper } from "../types/paper";
import { VaultWriter } from "../storage/vaultWriter";
import { StateStore } from "../storage/stateStore";
import { DedupStore } from "../storage/dedupStore";
import { SnapshotStore } from "../storage/snapshotStore";
import { ArxivSource } from "../sources/arxivSource";
import { HFSource } from "../sources/hfSource";
import { rankPapers } from "../scoring/rank";
import { aggregateDirections } from "../scoring/directions";
import { downloadPapersForDay, readPaperPdfAsBase64 } from "../storage/paperDownloader";
import { fetchArxivFullText } from "../sources/ar5ivFetcher";
import { OpenAICompatibleProvider } from "../llm/openaiCompatible";
import { AnthropicProvider } from "../llm/anthropicProvider";
import type { LLMProvider } from "../llm/provider";
import type { HFTrackStore } from "../storage/hfTrackStore";

function getISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Merge settings.keywords with per-direction queryKeywords (deduped). */
function computeEffectiveQueryKeywords(settings: PaperDailySettings): string[] {
  const fromDirections = settings.directions.flatMap(d => d.queryKeywords ?? []);
  return [...new Set([...settings.keywords, ...fromDirections])];
}

/** Derive interest keywords from direction match.keywords (weighted by direction.weight),
 *  merged with any explicit settings.interestKeywords (explicit takes priority). */
function computeEffectiveInterestKeywords(settings: PaperDailySettings): InterestKeyword[] {
  const explicit = settings.interestKeywords ?? [];
  const explicitSet = new Set(explicit.map(k => k.keyword.toLowerCase()));
  const seen = new Set<string>(explicitSet);
  const fromDirections: InterestKeyword[] = [];
  for (const dir of settings.directions) {
    for (const kw of dir.match.keywords) {
      const key = kw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      fromDirections.push({ keyword: kw, weight: Math.min(5, Math.round(dir.weight * 2)) });
    }
  }
  return [...explicit, ...fromDirections];
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

function formatTopDirections(papers: Paper[], topK: number): string {
  const dirAgg = aggregateDirections(papers);
  const sorted = Object.entries(dirAgg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK);
  if (sorted.length === 0) return "No directions detected.";
  return sorted.map(([name, score]) => `- ${name}: ${score.toFixed(1)}`).join("\n");
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
    `keywords: [${settings.keywords.join(", ")}]`,
    `interestKeywords: [${settings.interestKeywords.map(k => `${k.keyword}(${k.weight})`).join(", ")}]`,
    "---"
  ].join("\n");

  const header = `# Paper Daily — ${date}`;

  const dirAgg = aggregateDirections(rankedPapers);
  const topDirsSorted = Object.entries(dirAgg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, settings.directionTopK);
  const topDirsSection = topDirsSorted.length > 0
    ? "## Top Directions Today\n" + topDirsSorted.map(([n, s]) => `- **${n}** (score: ${s.toFixed(1)})`).join("\n")
    : "## Top Directions Today\n_No directions detected_";

  const digestSection = error
    ? `## 今日要点（AI 总结）\n\n> **Error**: ${error}`
    : `## 今日要点（AI 总结）\n\n${aiDigest}`;

  // ── Top-K Detailed Section ────────────────────────────────────
  const arxivTopK = settings.arxivDetailTopK ?? 10;
  const arxivTopPapers = rankedPapers.slice(0, arxivTopK);
  const arxivDetailedLines = arxivTopPapers.map((p, i) => {
    const links: string[] = [];
    if (p.links.html) links.push(`[arXiv](${p.links.html})`);
    if (settings.includePdfLink && p.links.pdf) links.push(`[PDF](${p.links.pdf})`);
    if (p.links.hf) links.push(`[HF](${p.links.hf})`);
    const dirStr = (p.topDirections ?? []).slice(0, 2).join(", ") || "_none_";
    const hitsStr = (p.interestHits ?? []).slice(0, 3).join(", ") || "_none_";
    const hfBadge = p.links.hf ? ` 🤗 HF${p.hfUpvotes ? ` ${p.hfUpvotes}↑` : ""}` : "";
    const scoreStr = p.llmScore != null
      ? ` ⭐ ${p.llmScore}/10${p.llmScoreReason ? ` — ${p.llmScoreReason}` : ""}`
      : "";
    const summaryLine = p.llmSummary ? `\n   > ${p.llmSummary}` : "";
    return [
      `${i + 1}. **${p.title}**${hfBadge}${scoreStr}${summaryLine}`,
      `   - ${links.join(" · ")} | Updated: ${p.updated.slice(0, 10)}`,
      `   - Directions: ${dirStr} | Hits: ${hitsStr}`,
    ].join("\n");
  });
  const arxivDetailedSection = `## Top ${arxivTopK} Papers\n\n${arxivDetailedLines.join("\n\n") || "_No papers_"}`;

  // ── All Papers Table ──────────────────────────────────────────
  const tableRows = rankedPapers.map((p, i) => {
    const titleLink = p.links.html
      ? `[${escapeTableCell(p.title)}](${p.links.html})`
      : escapeTableCell(p.title);
    const linkParts: string[] = [];
    if (p.links.html) linkParts.push(`[arXiv](${p.links.html})`);
    if (p.links.hf) linkParts.push(`[🤗 HF](${p.links.hf})`);
    if (settings.includePdfLink && p.links.pdf) linkParts.push(`[PDF](${p.links.pdf})`);
    const score = p.llmScore != null ? `⭐${p.llmScore}/10` : "-";
    const summary = escapeTableCell(p.llmSummary ?? "");
    const dirs = (p.topDirections ?? []).slice(0, 2).join(", ") || "-";
    const hits = (p.interestHits ?? []).slice(0, 3).join(", ") || "-";
    return `| ${i + 1} | ${titleLink} | ${linkParts.join(" ")} | ${score} | ${summary} | ${dirs} | ${hits} |`;
  });
  const allPapersTableSection = [
    "## All Papers",
    "",
    "| # | Title | Links | Score | Summary | Directions | Hits |",
    "|---|-------|-------|-------|---------|------------|------|",
    ...(tableRows.length > 0 ? tableRows : ["| — | _No papers_ | | | | | |"])
  ].join("\n");

  const sections = [frontmatter, "", header, "", topDirsSection, "", digestSection,
    "", arxivDetailedSection];
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

  const effectiveQueryKeywords = computeEffectiveQueryKeywords(settings);
  const effectiveInterestKeywords = computeEffectiveInterestKeywords(settings);
  log(`Settings: categories=[${settings.categories.join(",")}] queryKeywords=[${effectiveQueryKeywords.join(",")}] interestKeywords=${effectiveInterestKeywords.length} maxResults=${settings.maxResultsPerDay}`);

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
    const windowStart = options.windowStart ?? new Date(windowEnd.getTime() - settings.timeWindowHours * 3600 * 1000);
    fetchUrl = source.buildUrl(
      { categories: settings.categories, keywords: effectiveQueryKeywords, maxResults: settings.maxResultsPerDay, sortBy: settings.sortBy, windowStart, windowEnd },
      settings.maxResultsPerDay * 3
    );
    log(`Step 1 FETCH: url=${fetchUrl}`);
    papers = await source.fetch({
      categories: settings.categories,
      keywords: effectiveQueryKeywords,
      maxResults: settings.maxResultsPerDay,
      sortBy: settings.sortBy,
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
  if (!options.skipDedup && papers.length > 0) {
    papers = papers.filter(p => !dedupStore.hasId(p.id));
  }
  log(`Step 2 DEDUP: before=${countBeforeDedup} after=${papers.length} (filtered=${countBeforeDedup - papers.length})`);

  // ── Step 3: Score + rank ──────────────────────────────────────
  let rankedPapers = papers.length > 0
    ? rankPapers(papers, effectiveInterestKeywords, settings.directions, settings.directionTopK)
    : [];
  log(`Step 3 RANK: ${rankedPapers.length} papers ranked`);

  // ── Step 3b: LLM scoring (all papers) ────────────────────────
  if (rankedPapers.length > 0 && settings.llm.apiKey) {
    progress(`[2/5] ⭐ LLM 打分中... (${rankedPapers.length} 篇)`);
    try {
      const llm = buildLLMProvider(settings);
      const kwStr = effectiveInterestKeywords.map(k => `${k.keyword}(weight:${k.weight})`).join(", ");
      const papersForScoring = rankedPapers.map(p => ({
        id: p.id,
        title: p.title,
        abstract: p.abstract.slice(0, 250),
        directions: p.topDirections ?? [],
        interestHits: p.interestHits ?? [],
        ...(p.hfUpvotes ? { hfUpvotes: p.hfUpvotes } : {})
      }));
      const scoringPrompt = `Score each paper 1–10 for quality and relevance to the user's interests.

User's interest keywords (higher weight = more important): ${kwStr}

Scoring criteria:
- Alignment with interest keywords and their weights
- Technical novelty and depth
- Practical engineering value
- Quality of evaluation / experiments

Return ONLY a valid JSON array, no explanation, no markdown fence:
[{"id":"arxiv:...","score":8,"reason":"one short phrase","summary":"1–2 sentence plain-language summary"},...]

Papers:
${JSON.stringify(papersForScoring)}`;

      const result = await llm.generate({ prompt: scoringPrompt, temperature: 0.1, maxTokens: 4096 });
      if (result.usage) trackUsage("Step 3b scoring", result.usage.inputTokens, result.usage.outputTokens);
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const scores: Array<{ id: string; score: number; reason: string; summary?: string }> = JSON.parse(jsonMatch[0]);
        // Build a normalized lookup: strip arxiv: prefix and version suffix for fuzzy matching
        const normalizeId = (id: string) => id.replace(/^arxiv:/i, "").replace(/v\d+$/i, "").toLowerCase().trim();
        const scoreMap = new Map(scores.map(s => [normalizeId(s.id), s]));
        let matched = 0;
        for (const paper of rankedPapers) {
          const s = scoreMap.get(normalizeId(paper.id));
          if (s) {
            paper.llmScore = s.score;
            paper.llmScoreReason = s.reason;
            if (s.summary) paper.llmSummary = s.summary;
            matched++;
          }
        }
        // Re-rank by LLM score; papers without a score fall to the end
        rankedPapers.sort((a, b) => (b.llmScore ?? -1) - (a.llmScore ?? -1));
        log(`Step 3b LLM SCORE: scored ${matched}/${rankedPapers.length} papers (LLM returned ${scores.length}), re-ranked`);
        if (matched === 0) {
          log(`Step 3b LLM SCORE WARNING: 0 matched — ID format mismatch? Sample LLM id="${scores[0]?.id}" vs paper id="${rankedPapers[0]?.id}"`);
        }
      } else {
        log(`Step 3b LLM SCORE: could not parse JSON from response (response length=${result.text.length}, likely truncated)`);
      }
    } catch (err) {
      log(`Step 3b LLM SCORE ERROR: ${String(err)} (non-fatal, using keyword ranking)`);
    }
  } else {
    log(`Step 3b LLM SCORE: skipped (${rankedPapers.length === 0 ? "0 papers" : "no API key"})`);
  }

  // ── Step 3d: Download full text (ranked papers) ───────────────
  if (rankedPapers.length > 0) {
    await downloadPapersForDay(app, rankedPapers, settings, log);
  }

  // ── Step 3f: Full-text fetch for top-N papers (Deep Read) ─────
  let fulltextSection = "";
  if (settings.deepRead?.enabled && rankedPapers.length > 0 && settings.llm.apiKey) {
    const topN = Math.min(settings.deepRead.topN ?? 5, rankedPapers.length);
    const maxChars = settings.deepRead.maxCharsPerPaper ?? 8000;
    const parts: string[] = [];

    for (let i = 0; i < topN; i++) {
      const paper = rankedPapers[i];
      const baseId = paper.id.replace(/^arxiv:/i, "").replace(/v\d+$/i, "");
      log(`Step 3f FULLTEXT: fetching ${baseId}...`);
      const text = await fetchArxivFullText(baseId, maxChars);
      if (text) {
        parts.push(`### [${i + 1}] ${paper.title}\n\n${text}`);
        log(`Step 3f FULLTEXT: fetched ${baseId} (${text.length} chars)`);
      } else {
        log(`Step 3f FULLTEXT: could not fetch ${baseId}, skipping`);
      }
    }

    if (parts.length > 0) {
      fulltextSection = `\n\n## Full Paper Text (top ${parts.length} papers — use this for deeper per-paper analysis):\n> Texts are truncated. Focus on methods, experiments, and findings.\n\n${parts.join("\n\n---\n\n")}`;
    }
    log(`Step 3f FULLTEXT: ${parts.length}/${topN} papers fetched`);
  } else {
    log(`Step 3f FULLTEXT: skipped (enabled=${settings.deepRead?.enabled ?? false})`);
  }

  // ── Step 4: LLM ───────────────────────────────────────────────
  if (rankedPapers.length > 0 && settings.llm.apiKey) {
    progress(`[4/5] 🤖 生成摘要... (${settings.llm.model})`);
    log(`Step 4 LLM: provider=${settings.llm.provider} model=${settings.llm.model}`);
    try {
      const llm = buildLLMProvider(settings);
      const topK = Math.min(rankedPapers.length, 10);
      const topPapersForLLM = rankedPapers.slice(0, topK).map(p => ({
        id: p.id,
        title: p.title,
        abstract: p.abstract.slice(0, 500),
        categories: p.categories,
        directions: p.topDirections ?? [],
        interestHits: p.interestHits ?? [],
        ...(p.hfUpvotes ? { hfUpvotes: p.hfUpvotes } : {}),
        source: p.source,
        published: p.published,
        updated: p.updated,
        links: p.links
      }));
      const topDirsStr = formatTopDirections(rankedPapers, settings.directionTopK);
      const hfForLLM = hfDailyPapers.slice(0, 15).map(p => ({
        title: p.title,
        hfUpvotes: p.hfUpvotes ?? 0,
        ...(p.hfStreak && p.hfStreak > 1 ? { streakDays: p.hfStreak } : {})
      }));
      const prompt = fillTemplate(getActivePrompt(settings), {
        date,
        topDirections: topDirsStr,
        papers_json: JSON.stringify(topPapersForLLM, null, 2),
        hf_papers_json: JSON.stringify(hfForLLM, null, 2),
        fulltext_section: fulltextSection,
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
  if (!options.skipDedup && rankedPapers.length > 0) {
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
