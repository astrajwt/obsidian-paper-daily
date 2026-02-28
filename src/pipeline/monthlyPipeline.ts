import type { App } from "obsidian";
import type { PaperDailySettings } from "../types/config";
import type { Paper } from "../types/paper";
import { VaultWriter } from "../storage/vaultWriter";
import { StateStore } from "../storage/stateStore";
import { SnapshotStore } from "../storage/snapshotStore";
import { aggregateDirections } from "../scoring/directions";
import { OpenAICompatibleProvider } from "../llm/openaiCompatible";
import { AnthropicProvider } from "../llm/anthropicProvider";
import type { LLMProvider } from "../llm/provider";

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

export async function runMonthlyPipeline(
  app: App,
  settings: PaperDailySettings,
  stateStore: StateStore,
  snapshotStore: SnapshotStore
): Promise<void> {
  const writer = new VaultWriter(app);
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthStr = `${year}-${month}`;

  // Collect all snapshots for this month
  const start = `${monthStr}-01`;
  const end = `${monthStr}-31`; // snapshotStore range filter will handle actual days

  const snapshots = await snapshotStore.readSnapshotsForRange(start, end);
  const allPapers: Paper[] = snapshots.flatMap(s => s.papers);

  // Direction evolution: aggregate per week
  const dirAgg = aggregateDirections(allPapers);
  const sortedDirs = Object.entries(dirAgg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, settings.directionTopK);
  const dirEvolutionStr = sortedDirs.length > 0
    ? sortedDirs.map(([n, s]) => `- ${n}: ${s.toFixed(1)}`).join("\n")
    : "No data";

  let monthlyContent = "";

  if (allPapers.length === 0) {
    monthlyContent = `# Monthly Report — ${monthStr}\n\n_No papers collected this month._`;
  } else if (!settings.llm.apiKey) {
    monthlyContent = buildMonthlyMarkdownNoLLM(monthStr, allPapers, dirEvolutionStr, settings);
  } else {
    try {
      const llm = buildLLMProvider(settings);
      const topPapers = allPapers.slice(0, 30).map(p => ({
        title: p.title,
        categories: p.categories,
        directions: p.topDirections ?? [],
        interestHits: p.interestHits ?? [],
        date: p.updated.slice(0, 10)
      }));

      const prompt = fillTemplate(settings.llm.monthlyPromptTemplate, {
        month: monthStr,
        papers_json: JSON.stringify(topPapers, null, 2),
        directionEvolution: dirEvolutionStr,
        language: settings.language === "zh" ? "Chinese (中文)" : "English"
      });

      const result = await llm.generate({
        prompt,
        temperature: settings.llm.temperature,
        maxTokens: settings.llm.maxTokens
      });
      monthlyContent = `# Monthly Report — ${monthStr}\n\n${result.text}`;
    } catch (err) {
      monthlyContent = buildMonthlyMarkdownNoLLM(monthStr, allPapers, dirEvolutionStr, settings);
      monthlyContent += `\n\n> **LLM Error**: ${String(err)}`;
    }
  }

  const monthlyPath = `${settings.rootFolder}/monthly/${monthStr}.md`;
  await writer.writeNote(monthlyPath, monthlyContent);
  await stateStore.setLastMonthlyRun(now.toISOString());
}

function buildMonthlyMarkdownNoLLM(
  monthStr: string,
  papers: Paper[],
  dirEvolution: string,
  settings: PaperDailySettings
): string {
  const top10 = papers.slice(0, 10);
  const paperList = top10.map((p, i) => {
    const links: string[] = [];
    if (p.links.html) links.push(`[arXiv](${p.links.html})`);
    return `${i + 1}. **${p.title}** — ${(p.topDirections ?? []).join(", ")} — ${links.join(", ")}`;
  }).join("\n");

  return [
    `# Monthly Report — ${monthStr}`,
    "",
    `Total papers collected: ${papers.length}`,
    "",
    "## Direction Evolution",
    dirEvolution,
    "",
    "## Monthly Highlights (Top 10)",
    paperList || "_No papers_"
  ].join("\n");
}
