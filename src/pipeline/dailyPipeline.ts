import type { App } from "obsidian";
import type { PaperDailySettings } from "../types/config";
import type { Paper } from "../types/paper";
import { VaultWriter } from "../storage/vaultWriter";
import { StateStore } from "../storage/stateStore";
import { DedupStore } from "../storage/dedupStore";
import { SnapshotStore } from "../storage/snapshotStore";
import { ArxivSource } from "../sources/arxivSource";
import { rankPapers } from "../scoring/rank";
import { aggregateDirections } from "../scoring/directions";
import { OpenAICompatibleProvider } from "../llm/openaiCompatible";
import { AnthropicProvider } from "../llm/anthropicProvider";
import type { LLMProvider } from "../llm/provider";
import type { VaultLinker } from "../linking/vaultLinker";

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
  aiDigest: string,
  relatedNotesMap: Map<string, string[]>,
  error?: string
): string {
  const frontmatter = [
    "---",
    "type: paper-daily",
    `date: ${date}`,
    "sources: [arxiv]",
    `categories: [${settings.categories.join(", ")}]`,
    `keywords: [${settings.keywords.join(", ")}]`,
    `interestKeywords: [${settings.interestKeywords.join(", ")}]`,
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

  const topN = Math.min(rankedPapers.length, settings.maxResultsPerDay);
  const topPapers = rankedPapers.slice(0, topN);
  const topPapersLines = topPapers.map((p, i) => {
    const dirStr = (p.topDirections ?? []).join(", ") || "_none_";
    const hitsStr = (p.interestHits ?? []).join(", ") || "_none_";
    const linksArr: string[] = [];
    if (p.links.html) linksArr.push(`[arXiv](${p.links.html})`);
    if (settings.includePdfLink && p.links.pdf) linksArr.push(`[PDF](${p.links.pdf})`);
    const linksStr = linksArr.join(", ");
    const authorsStr = p.authors.slice(0, 3).join(", ") + (p.authors.length > 3 ? " et al." : "");
    return [
      `${i + 1}. **${p.title}**`,
      `   - Directions: ${dirStr}`,
      `   - Interest hits: ${hitsStr}`,
      settings.includeAbstract ? `   - Abstract: ${p.abstract.slice(0, 300)}...` : "",
      `   - Links: ${linksStr}`,
      `   - Authors: ${authorsStr}`,
      `   - Updated: ${p.updated.slice(0, 10)}`,
      relatedNotesMap.has(p.id) ? `   - Related Notes: ${relatedNotesMap.get(p.id)!.join(" ")}` : ""
    ].filter(Boolean).join("\n");
  });
  const topPapersSection = `## Top Papers (ranked)\n\n${topPapersLines.join("\n\n") || "_No papers_"}`;

  const allPapersRows = rankedPapers.map(p => {
    const links: string[] = [];
    if (p.links.html) links.push(`[arXiv](${p.links.html})`);
    if (settings.includePdfLink && p.links.pdf) links.push(`[PDF](${p.links.pdf})`);
    const dirStr = (p.topDirections ?? []).slice(0, 2).join(", ");
    const hitsStr = (p.interestHits ?? []).slice(0, 3).join(", ");
    return `| ${p.title.slice(0, 60)} | ${p.updated.slice(0, 10)} | ${dirStr} | ${hitsStr} | ${links.join(" ")} |`;
  });
  const allPapersSection = [
    "## All Papers (raw)",
    "| Title | Updated | Directions | Interest Hits | Links |",
    "|-------|---------|------------|---------------|-------|",
    ...allPapersRows
  ].join("\n");

  return [frontmatter, "", header, "", topDirsSection, "", digestSection, "", topPapersSection, "", allPapersSection].join("\n");
}

export interface DailyPipelineOptions {
  targetDate?: string;
  windowStart?: Date;
  windowEnd?: Date;
  skipDedup?: boolean;
  linker?: VaultLinker;
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

  log(`=== Daily pipeline START date=${date} ===`);
  log(`Settings: categories=[${settings.categories.join(",")}] keywords=[${settings.keywords.join(",")}] maxResults=${settings.maxResultsPerDay}`);

  let papers: Paper[] = [];
  let fetchError: string | undefined;
  let llmDigest = "";
  let llmError: string | undefined;

  // ── Step 1: Fetch ─────────────────────────────────────────────
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
    }
  } catch (err) {
    fetchError = String(err);
    log(`Step 1 FETCH ERROR: ${fetchError}`);
    await stateStore.setLastError("fetch", fetchError);
  }

  // ── Step 2: Dedup ─────────────────────────────────────────────
  const countBeforeDedup = papers.length;
  if (!options.skipDedup && papers.length > 0) {
    papers = papers.filter(p => !dedupStore.hasId(p.id));
  }
  log(`Step 2 DEDUP: before=${countBeforeDedup} after=${papers.length} (filtered=${countBeforeDedup - papers.length})`);

  // ── Step 3: Score + rank ──────────────────────────────────────
  const rankedPapers = papers.length > 0
    ? rankPapers(papers, settings.interestKeywords, settings.directions, settings.directionTopK)
    : [];
  log(`Step 3 RANK: ${rankedPapers.length} papers ranked`);

  // ── Step 3b: Vault linking ────────────────────────────────────
  const relatedNotesMap = new Map<string, string[]>();
  if (settings.vaultLinking?.enabled && options.linker && rankedPapers.length > 0) {
    let linkCount = 0;
    for (const paper of rankedPapers) {
      const matches = options.linker.findRelated(paper);
      if (matches.length > 0) {
        relatedNotesMap.set(paper.id, matches.map(m => `[[${m.displayName}]]`));
        linkCount++;
      }
    }
    log(`Step 3b LINKING: ${linkCount}/${rankedPapers.length} papers got related notes`);
  } else {
    log(`Step 3b LINKING: skipped (enabled=${settings.vaultLinking?.enabled} linker=${!!options.linker})`);
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
        published: p.published,
        updated: p.updated,
        links: p.links
      }));
      const topDirsStr = formatTopDirections(rankedPapers, settings.directionTopK);
      const prompt = fillTemplate(settings.llm.dailyPromptTemplate, {
        date,
        topDirections: topDirsStr,
        papers_json: JSON.stringify(topPapersForLLM, null, 2),
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
    const markdown = buildDailyMarkdown(date, settings, rankedPapers, llmDigest, relatedNotesMap, errorMsg);
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

  // ── Flush log ─────────────────────────────────────────────────
  await writer.appendToNote(logPath, logLines.join("\n") + "\n");
}
