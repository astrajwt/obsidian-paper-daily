import type { App } from "obsidian";
import type { PaperDailySettings } from "../types/config";
import type { Paper } from "../types/paper";
import { VaultWriter } from "../storage/vaultWriter";
import { StateStore } from "../storage/stateStore";
import { SnapshotStore } from "../storage/snapshotStore";
import { ArxivSource } from "../sources/arxivSource";
import { HFSource } from "../sources/hfSource";
import { rankPapers } from "../scoring/rank";
import { aggregateDirections } from "../scoring/directions";
import { computeHotness } from "../scoring/hotness";
import { downloadPapersForDay } from "../storage/paperDownloader";
import { OpenAICompatibleProvider } from "../llm/openaiCompatible";
import { AnthropicProvider } from "../llm/anthropicProvider";
import type { LLMProvider } from "../llm/provider";
import type { HFTrackStore } from "../storage/hfTrackStore";

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

function formatTopDirections(papers: Paper[], topK: number): string {
  const dirAgg = aggregateDirections(papers);
  const sorted = Object.entries(dirAgg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK);
  if (sorted.length === 0) return "No directions detected.";
  return sorted.map(([name, score]) => `- ${name}: ${score.toFixed(1)}`).join("\n");
}

function buildDailyMarkdown(
  date: string,
  settings: PaperDailySettings,
  rankedPapers: Paper[],
  hfDailyPapers: Paper[],
  trendingPapers: Array<{ paper: Paper; hotness: number; reasons: string[] }>,
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

  // HuggingFace Daily Papers section
  let hfSection = "";
  if (hfDailyPapers.length > 0) {
    // Build set of base arXiv IDs that appear in today's ranked (arXiv) results
    const arxivBaseIds = new Set(
      rankedPapers.map(p => `arxiv:${p.id.replace(/^arxiv:/i, "").replace(/v\d+$/i, "")}`)
    );

    const alsoInArxivCount = hfDailyPapers.filter(p => arxivBaseIds.has(p.id)).length;
    const summaryLine = alsoInArxivCount > 0
      ? `共 ${hfDailyPapers.length} 篇，其中 ${alsoInArxivCount} 篇同时出现在今日 arXiv 检索结果中。`
      : `共 ${hfDailyPapers.length} 篇，均不在今日 arXiv 关键词检索范围内。`;

    const hfLines = hfDailyPapers.map((p, i) => {
      const linksArr: string[] = [];
      if (p.links.hf) linksArr.push(`[HF](${p.links.hf})`);
      if (p.links.html) linksArr.push(`[arXiv](${p.links.html})`);
      if (settings.includePdfLink && p.links.pdf) linksArr.push(`[PDF](${p.links.pdf})`);
      const authorsStr = p.authors.slice(0, 3).join(", ") + (p.authors.length > 3 ? " et al." : "");
      const arxivBadge = arxivBaseIds.has(p.id) ? " 📄 今日 arXiv 收录" : "";
      const streakBadge = (p.hfStreak ?? 1) > 1 ? ` 🔥 霸榜${p.hfStreak}天` : "";
      return [
        `${i + 1}. **${p.title}** 🤗 ${p.hfUpvotes ?? 0}${arxivBadge}${streakBadge}`,
        `   - Links: ${linksArr.join(", ")}`,
        `   - Authors: ${authorsStr}`,
        `   - Published: ${p.published.slice(0, 10)}`,
      ].join("\n");
    });
    hfSection = `## HuggingFace Daily Papers\n\n${summaryLine}\n\n${hfLines.join("\n\n")}`;
  }

  const allPapersList = rankedPapers.map((p, i) => {
    const links: string[] = [];
    if (p.links.html) links.push(`[arXiv](${p.links.html})`);
    if (settings.includePdfLink && p.links.pdf) links.push(`[PDF](${p.links.pdf})`);
    if (p.links.hf) links.push(`[HF](${p.links.hf})`);
    const dirStr = (p.topDirections ?? []).slice(0, 2).join(", ") || "_none_";
    const hitsStr = (p.interestHits ?? []).slice(0, 3).join(", ") || "_none_";
    const upvoteStr = p.hfUpvotes != null ? ` 🤗 ${p.hfUpvotes}` : "";
    const scoreStr = p.llmScore != null
      ? ` ⭐ ${p.llmScore}/10${p.llmScoreReason ? ` — ${p.llmScoreReason}` : ""}`
      : "";
    const summaryLine = p.llmSummary ? `\n   > ${p.llmSummary}` : "";
    return [
      `${i + 1}. **${p.title}**${upvoteStr}${scoreStr}${summaryLine}`,
      `   - ${links.join(" · ")} | Updated: ${p.updated.slice(0, 10)}`,
      `   - Directions: ${dirStr} | Hits: ${hitsStr}`,
    ].join("\n");
  });
  const allPapersSection = `## All Papers\n\n${allPapersList.join("\n\n") || "_No papers_"}`;

  // Trending section
  let trendingSection = "";
  if (trendingPapers.length > 0) {
    const trendingLines = trendingPapers.map((t, i) => {
      const links: string[] = [];
      if (t.paper.links.html) links.push(`[arXiv](${t.paper.links.html})`);
      if (settings.includePdfLink && t.paper.links.pdf) links.push(`[PDF](${t.paper.links.pdf})`);
      if (t.paper.links.hf) links.push(`[HF](${t.paper.links.hf})`);
      return [
        `${i + 1}. **${t.paper.title}**`,
        `   - Hotness: ${t.hotness.toFixed(1)} — ${t.reasons.join(", ")}`,
        `   - Categories: ${t.paper.categories.join(", ")}`,
        `   - Links: ${links.join(", ")} | Authors: ${t.paper.authors.slice(0, 3).join(", ")}${t.paper.authors.length > 3 ? " et al." : ""}`
      ].filter(Boolean).join("\n");
    });
    trendingSection = `## Trending Papers (no keyword match)\n\n> These papers scored 0 on interest/directions but rank high on hotness (version revisions, cross-listing, recency).\n\n${trendingLines.join("\n\n")}`;
  }

  const sections = [frontmatter, "", header, "", topDirsSection, "", digestSection];
  if (hfSection) sections.push("", hfSection);
  sections.push("", allPapersSection);
  if (trendingSection) sections.push("", trendingSection);
  return sections.join("\n");
}

export interface DailyPipelineOptions {
  targetDate?: string;
  windowStart?: Date;
  windowEnd?: Date;
  hfTrackStore?: HFTrackStore;
}

export async function runDailyPipeline(
  app: App,
  settings: PaperDailySettings,
  stateStore: StateStore,
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

  log(`=== Daily pipeline START date=${date} ===`);
  log(`Settings: categories=[${settings.categories.join(",")}] keywords=[${settings.keywords.join(",")}] maxResults=${settings.maxResultsPerDay}`);

  let papers: Paper[] = [];
  let hfDailyPapers: Paper[] = [];
  let fetchError: string | undefined;
  let llmDigest = "";
  let llmError: string | undefined;
  const activeSources: string[] = [];

  // ── Step 1: Fetch arXiv ───────────────────────────────────────
  let fetchUrl = "";
  try {
    const source = new ArxivSource();
    const windowEnd = options.windowEnd ?? now;
    const windowStart = options.windowStart ?? new Date(windowEnd.getTime() - settings.timeWindowHours * 3600 * 1000);
    fetchUrl = source.buildUrl(
      { categories: settings.categories, keywords: settings.keywords, maxResults: settings.maxResultsPerDay, sortBy: settings.sortBy, windowStart, windowEnd },
      settings.maxResultsPerDay * 3
    );
    log(`Step 1 FETCH: url=${fetchUrl}`);
    papers = await source.fetch({
      categories: settings.categories,
      keywords: settings.keywords,
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
      }
    } catch (err) {
      log(`Step 1b HF FETCH ERROR: ${String(err)} (non-fatal, continuing)`);
    }
  } else {
    log(`Step 1b HF FETCH: skipped (disabled)`);
  }

  // ── Step 3: Score + rank ──────────────────────────────────────
  let rankedPapers = papers.length > 0
    ? rankPapers(papers, settings.interestKeywords, settings.directions, settings.directionTopK)
    : [];
  log(`Step 3 RANK: ${rankedPapers.length} papers ranked`);

  // ── Step 3b: LLM scoring (all papers) ────────────────────────
  if (rankedPapers.length > 0 && settings.llm.apiKey) {
    try {
      const llm = buildLLMProvider(settings);
      const kwStr = settings.interestKeywords.map(k => `${k.keyword}(weight:${k.weight})`).join(", ");
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

      const result = await llm.generate({ prompt: scoringPrompt, temperature: 0.1, maxTokens: 2048 });
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const scores: Array<{ id: string; score: number; reason: string; summary?: string }> = JSON.parse(jsonMatch[0]);
        const scoreMap = new Map(scores.map(s => [s.id, s]));
        for (const paper of rankedPapers) {
          const s = scoreMap.get(paper.id);
          if (s) {
            paper.llmScore = s.score;
            paper.llmScoreReason = s.reason;
            if (s.summary) paper.llmSummary = s.summary;
          }
        }
        // Re-rank by LLM score; papers without a score fall to the end
        rankedPapers.sort((a, b) => (b.llmScore ?? -1) - (a.llmScore ?? -1));
        log(`Step 3b LLM SCORE: scored ${scores.length}/${rankedPapers.length} papers, re-ranked`);
      } else {
        log(`Step 3b LLM SCORE: could not parse JSON from response`);
      }
    } catch (err) {
      log(`Step 3b LLM SCORE ERROR: ${String(err)} (non-fatal, using keyword ranking)`);
    }
  } else {
    log(`Step 3b LLM SCORE: skipped (${rankedPapers.length === 0 ? "0 papers" : "no API key"})`);
  }

  // ── Step 3c: Trending (zero-score papers with high hotness) ───
  const trendingPapers: Array<{ paper: Paper; hotness: number; reasons: string[] }> = [];
  if (settings.trending?.enabled && papers.length > 0) {
    // "zero-score" = not in the ranked list (direction+interest score was 0)
    const rankedIds = new Set(rankedPapers.map(p => p.id));
    const unranked = papers.filter(p => !rankedIds.has(p.id));
    const scored = unranked.map(p => {
      const h = computeHotness(p);
      return { paper: p, hotness: h.score, reasons: h.reasons };
    }).filter(t => t.hotness >= (settings.trending.minHotness ?? 2));
    scored.sort((a, b) => b.hotness - a.hotness);
    const topTrending = scored.slice(0, settings.trending.topK ?? 5);
    trendingPapers.push(...topTrending);

    log(`Step 3c TRENDING: ${unranked.length} unranked papers → ${trendingPapers.length} trending (minHotness=${settings.trending.minHotness})`);
  } else {
    log(`Step 3c TRENDING: skipped (enabled=${settings.trending?.enabled})`);
  }

  // ── Step 3d: Download full text ───────────────────────────────
  if (rankedPapers.length > 0) {
    await downloadPapersForDay(app, rankedPapers, settings, log);
  }

  // ── Step 4: LLM ───────────────────────────────────────────────
  if (rankedPapers.length > 0 && settings.llm.apiKey) {
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
      const prompt = fillTemplate(settings.llm.dailyPromptTemplate, {
        date,
        topDirections: topDirsStr,
        papers_json: JSON.stringify(topPapersForLLM, null, 2),
        hf_papers_json: JSON.stringify(hfForLLM, null, 2),
        language: settings.language === "zh" ? "Chinese (中文)" : "English"
      });
      const result = await llm.generate({ prompt, temperature: settings.llm.temperature, maxTokens: settings.llm.maxTokens });
      llmDigest = result.text;
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

  try {
    const markdown = buildDailyMarkdown(date, settings, rankedPapers, hfDailyPapers, trendingPapers, llmDigest, activeSources, errorMsg);
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

  // ── Step 6: Update state ──────────────────────────────────────
  if (!options.targetDate) {
    await stateStore.setLastDailyRun(now.toISOString());
  }

  log(`=== Daily pipeline END date=${date} papers=${rankedPapers.length} ===`);

  // ── Flush log ─────────────────────────────────────────────────
  await writer.appendToNote(logPath, logLines.join("\n") + "\n");
}
