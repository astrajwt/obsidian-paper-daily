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

function getISOWeek(d: Date): string {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((dayOfYear + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
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

export async function runWeeklyPipeline(
  app: App,
  settings: PaperDailySettings,
  stateStore: StateStore,
  snapshotStore: SnapshotStore
): Promise<void> {
  const writer = new VaultWriter(app);
  const now = new Date();
  const weekStr = getISOWeek(now);

  // Collect last 7 days snapshots
  const end = now.toISOString().slice(0, 10);
  const startD = new Date(now);
  startD.setDate(startD.getDate() - 6);
  const start = startD.toISOString().slice(0, 10);

  const snapshots = await snapshotStore.readSnapshotsForRange(start, end);
  const allPapers: Paper[] = snapshots.flatMap(s => s.papers);

  // Compute direction trends
  const dirAgg = aggregateDirections(allPapers);
  const sortedDirs = Object.entries(dirAgg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, settings.directionTopK);
  const dirTrendsStr = sortedDirs.length > 0
    ? sortedDirs.map(([n, s]) => `- ${n}: ${s.toFixed(1)}`).join("\n")
    : "No data";

  let weeklyContent = "";

  if (allPapers.length === 0) {
    weeklyContent = `# Weekly Report — ${weekStr}\n\n_No papers collected this week._`;
  } else if (!settings.llm.apiKey) {
    weeklyContent = buildWeeklyMarkdownNoLLM(weekStr, allPapers, dirTrendsStr, settings);
  } else {
    try {
      const llm = buildLLMProvider(settings);
      const topPapers = allPapers.slice(0, 20).map(p => ({
        title: p.title,
        categories: p.categories,
        directions: p.topDirections ?? [],
        interestHits: p.interestHits ?? [],
        date: p.updated.slice(0, 10)
      }));

      const prompt = fillTemplate(settings.llm.weeklyPromptTemplate, {
        week: weekStr,
        papers_json: JSON.stringify(topPapers, null, 2),
        directionTrends: dirTrendsStr,
        language: settings.language === "zh" ? "Chinese (中文)" : "English"
      });

      const result = await llm.generate({
        prompt,
        temperature: settings.llm.temperature,
        maxTokens: settings.llm.maxTokens
      });
      weeklyContent = `# Weekly Report — ${weekStr}\n\n${result.text}`;
    } catch (err) {
      weeklyContent = buildWeeklyMarkdownNoLLM(weekStr, allPapers, dirTrendsStr, settings);
      weeklyContent += `\n\n> **LLM Error**: ${String(err)}`;
    }
  }

  const weeklyPath = `${settings.rootFolder}/weekly/${weekStr}.md`;
  await writer.writeNote(weeklyPath, weeklyContent);
  await stateStore.setLastWeeklyRun(now.toISOString());
}

function buildWeeklyMarkdownNoLLM(
  weekStr: string,
  papers: Paper[],
  dirTrends: string,
  settings: PaperDailySettings
): string {
  const top10 = papers.slice(0, 10);
  const paperList = top10.map((p, i) => {
    const links: string[] = [];
    if (p.links.html) links.push(`[arXiv](${p.links.html})`);
    return `${i + 1}. **${p.title}** — ${(p.topDirections ?? []).join(", ")} — ${links.join(", ")}`;
  }).join("\n");

  return [
    `# Weekly Report — ${weekStr}`,
    "",
    "## Direction Trends",
    dirTrends,
    "",
    `## Top Papers (${papers.length} total this week)`,
    paperList || "_No papers_"
  ].join("\n");
}
