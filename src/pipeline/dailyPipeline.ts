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

  // Top directions section
  const dirAgg = aggregateDirections(rankedPapers);
  const topDirsSorted = Object.entries(dirAgg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, settings.directionTopK);
  const topDirsSection = topDirsSorted.length > 0
    ? "## Top Directions Today\n" + topDirsSorted.map(([n, s]) => `- **${n}** (score: ${s.toFixed(1)})`).join("\n")
    : "## Top Directions Today\n_No directions detected_";

  // AI digest section
  const digestSection = error
    ? `## 今日要点（AI 总结）\n\n> **Error**: ${error}`
    : `## 今日要点（AI 总结）\n\n${aiDigest}`;

  // Top papers section
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
      `   - Updated: ${p.updated.slice(0, 10)}`
    ].filter(Boolean).join("\n");
  });
  const topPapersSection = `## Top Papers (ranked)\n\n${topPapersLines.join("\n\n") || "_No papers_"}`;

  // All papers raw table
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
  targetDate?: string;     // YYYY-MM-DD override (for backfill)
  windowStart?: Date;
  windowEnd?: Date;
  skipDedup?: boolean;
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

  const windowEnd = options.windowEnd ?? now;
  const windowStart = options.windowStart ?? new Date(windowEnd.getTime() - settings.timeWindowHours * 3600 * 1000);

  const inboxPath = `${settings.rootFolder}/inbox/${date}.md`;
  const logPath = `${settings.rootFolder}/cache/runs.log`;

  let papers: Paper[] = [];
  let fetchError: string | undefined;
  let llmDigest = "";
  let llmError: string | undefined;

  // 1. Fetch
  try {
    const source = new ArxivSource();
    papers = await source.fetch({
      categories: settings.categories,
      keywords: settings.keywords,
      maxResults: settings.maxResultsPerDay,
      sortBy: settings.sortBy,
      windowStart,
      windowEnd,
      targetDate: date
    });
  } catch (err) {
    fetchError = String(err);
    await stateStore.setLastError("fetch", fetchError);
  }

  // 2. Dedup
  if (!options.skipDedup && papers.length > 0) {
    papers = papers.filter(p => !dedupStore.hasId(p.id));
  }

  // 3. Score + rank
  const rankedPapers = papers.length > 0
    ? rankPapers(papers, settings.interestKeywords, settings.directions, settings.directionTopK)
    : [];

  // 4. LLM digest
  if (rankedPapers.length > 0 && settings.llm.apiKey) {
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

      const result = await llm.generate({
        prompt,
        temperature: settings.llm.temperature,
        maxTokens: settings.llm.maxTokens
      });
      llmDigest = result.text;
    } catch (err) {
      llmError = String(err);
      await stateStore.setLastError("llm", llmError);
    }
  } else if (!settings.llm.apiKey) {
    llmError = "LLM API key not configured";
  }

  // 5. Build error message for digest
  const errorMsg = fetchError
    ? `Fetch failed: ${fetchError}${llmError ? `\n\nLLM failed: ${llmError}` : ""}`
    : llmError
    ? `LLM failed: ${llmError}`
    : undefined;

  // 6. Write markdown
  try {
    const markdown = buildDailyMarkdown(date, settings, rankedPapers, llmDigest, errorMsg);
    await writer.writeNote(inboxPath, markdown);
  } catch (err) {
    await stateStore.setLastError("write", String(err));
    throw err;
  }

  // 7. Write snapshot
  await snapshotStore.writeSnapshot(
    date,
    rankedPapers,
    fetchError
  );

  // 8. Update dedup
  if (!options.skipDedup && rankedPapers.length > 0) {
    await dedupStore.markSeenBatch(rankedPapers.map(p => p.id), date);
  }

  // 9. Update state
  if (!options.targetDate) {
    await stateStore.setLastDailyRun(now.toISOString());
  }

  // 10. Append to runs log
  const logLine = `[${now.toISOString()}] daily date=${date} fetched=${papers.length} ranked=${rankedPapers.length} fetchError=${fetchError ?? "none"} llmError=${llmError ?? "none"}\n`;
  await writer.appendToNote(logPath, logLine);
}
