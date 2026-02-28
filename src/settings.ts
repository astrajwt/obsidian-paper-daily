import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type PaperDailyPlugin from "./main";
import type { PaperDailySettings, DirectionConfig } from "./types/config";

export const DEFAULT_DAILY_PROMPT = `You are a research paper analyst specializing in AI/ML systems, RL, and LLM infrastructure.

Today's date: {{date}}

Pre-computed top directions for today:
{{topDirections}}

Papers to analyze (JSON):
{{papers_json}}

Please generate a structured daily digest in {{language}} with:

1. **今日要点 / Key Takeaways** (3-5 bullet points summarizing overall trends)

2. **Top Directions Today** (use the pre-computed directions above, add brief commentary on why these papers matter for each direction)

3. **Top Papers** — for each paper provide:
   - One-line contribution summary
   - Directions it belongs to + which keywords matched
   - Why it matters (engineering/system perspective)
   - Key limitations
   - Links

Format as clean Markdown. Be concise and engineering-focused.`;

export const DEFAULT_WEEKLY_PROMPT = `You are a research paper analyst.

Week: {{week}}
Papers from the past 7 days (JSON):
{{papers_json}}

Direction trends this week:
{{directionTrends}}

Generate a weekly report in {{language}} covering:
1. **本周方向趋势 / Direction Trends** — which directions dominated, any shifts
2. **Top Recurring Keywords** — most frequent interest keywords
3. **推荐精读 / Recommended Deep Dives** (top 5 papers worth reading in full)
4. **本周总结 / Weekly Summary** — 3-5 bullet points

Format as clean Markdown.`;

export const DEFAULT_MONTHLY_PROMPT = `You are a research paper analyst.

Month: {{month}}
Papers collected this month (JSON):
{{papers_json}}

Direction evolution:
{{directionEvolution}}

Generate a monthly report in {{language}} covering:
1. **月度方向演进 / Direction Evolution** — stable vs emerging themes
2. **关键词热度 / Keyword Heatmap** — top recurring keywords
3. **月度精华 / Monthly Highlights** — top 10 papers
4. **趋势洞察 / Trend Insights** — broader observations
5. **月度总结 / Monthly Summary**

Format as clean Markdown.`;

export const DEFAULT_SETTINGS: PaperDailySettings = {
  categories: ["cs.AI", "cs.LG", "cs.CL"],
  keywords: [],
  interestKeywords: ["rlhf", "ppo", "dpo", "agent", "kv cache", "inference", "moe"],
  maxResultsPerDay: 20,
  sortBy: "submittedDate",
  timeWindowHours: 72,

  directions: [
    {
      name: "RLHF & Post-training",
      weight: 1.5,
      match: {
        keywords: ["rlhf", "ppo", "dpo", "grpo", "reward model", "preference", "post-training", "alignment"],
        categories: ["cs.AI", "cs.LG"]
      }
    },
    {
      name: "Agentic RL",
      weight: 1.4,
      match: {
        keywords: ["agent", "tool use", "planner", "react", "function calling", "multi-agent", "agentic"],
        categories: ["cs.AI"]
      }
    },
    {
      name: "Inference Serving",
      weight: 1.3,
      match: {
        keywords: ["kv cache", "pagedattention", "speculative", "vllm", "sglang", "tensorrt", "inference serving", "throughput", "latency"],
        categories: ["cs.DC", "cs.AR"]
      }
    },
    {
      name: "Training Systems",
      weight: 1.2,
      match: {
        keywords: ["fsdp", "zero", "deepspeed", "megatron", "pipeline parallel", "checkpoint", "distributed training"],
        categories: ["cs.DC"]
      }
    },
    {
      name: "MoE",
      weight: 1.2,
      match: {
        keywords: ["moe", "mixture of experts", "expert", "alltoall", "routing", "sparse"],
        categories: ["cs.LG", "cs.AI"]
      }
    }
  ],
  directionTopK: 5,

  llm: {
    provider: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 4096,
    dailyPromptTemplate: DEFAULT_DAILY_PROMPT,
    weeklyPromptTemplate: DEFAULT_WEEKLY_PROMPT,
    monthlyPromptTemplate: DEFAULT_MONTHLY_PROMPT
  },

  rootFolder: "PaperDaily",
  language: "zh",
  includeAbstract: true,
  includePdfLink: true,

  schedule: {
    dailyTime: "08:30",
    weeklyDay: 6,
    weeklyTime: "18:00",
    monthlyDay: 1,
    monthlyTime: "09:00"
  },

  backfillMaxDays: 30
};

export class PaperDailySettingTab extends PluginSettingTab {
  plugin: PaperDailyPlugin;

  constructor(app: App, plugin: PaperDailyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h1", { text: "Paper Daily Settings" });

    // ── arXiv Fetch ──────────────────────────────────────────────
    containerEl.createEl("h2", { text: "arXiv Fetch" });

    new Setting(containerEl)
      .setName("Categories")
      .setDesc("Comma-separated arXiv categories (e.g. cs.AI,cs.LG,cs.CL)")
      .addText(text => text
        .setPlaceholder("cs.AI,cs.LG,cs.CL")
        .setValue(this.plugin.settings.categories.join(","))
        .onChange(async (value) => {
          this.plugin.settings.categories = value.split(",").map(s => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Keywords")
      .setDesc("Comma-separated query keywords (optional, combined with categories via AND)")
      .addText(text => text
        .setPlaceholder("reinforcement learning, agent")
        .setValue(this.plugin.settings.keywords.join(","))
        .onChange(async (value) => {
          this.plugin.settings.keywords = value.split(",").map(s => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Interest Keywords")
      .setDesc("Keywords you care about most — used for ranking and highlighting in digests")
      .addText(text => text
        .setPlaceholder("rlhf, kv cache, agent")
        .setValue(this.plugin.settings.interestKeywords.join(","))
        .onChange(async (value) => {
          this.plugin.settings.interestKeywords = value.split(",").map(s => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Max Results Per Day")
      .setDesc("Maximum papers to include in daily digest (after ranking)")
      .addSlider(slider => slider
        .setLimits(5, 100, 5)
        .setValue(this.plugin.settings.maxResultsPerDay)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.maxResultsPerDay = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Time Window (hours)")
      .setDesc("Fetch papers from the past N hours (default 30 to catch overnight updates)")
      .addSlider(slider => slider
        .setLimits(12, 72, 6)
        .setValue(this.plugin.settings.timeWindowHours)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.timeWindowHours = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Sort By")
      .setDesc("Sort arXiv results by submission date or last updated date")
      .addDropdown(drop => drop
        .addOption("submittedDate", "Submitted Date")
        .addOption("lastUpdatedDate", "Last Updated Date")
        .setValue(this.plugin.settings.sortBy)
        .onChange(async (value) => {
          this.plugin.settings.sortBy = value as "submittedDate" | "lastUpdatedDate";
          await this.plugin.saveSettings();
        }));

    // ── Directions ───────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Directions / Themes" });

    new Setting(containerEl)
      .setName("Direction Top-K")
      .setDesc("Number of top directions to show in daily digest")
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.directionTopK)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.directionTopK = value;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl("p", {
      text: "Directions JSON (advanced) — edit directions config directly:",
      cls: "setting-item-description"
    });

    const directionsTextArea = containerEl.createEl("textarea", {
      cls: "paper-daily-directions-textarea"
    });
    directionsTextArea.style.width = "100%";
    directionsTextArea.style.height = "200px";
    directionsTextArea.style.fontFamily = "monospace";
    directionsTextArea.style.fontSize = "12px";
    directionsTextArea.value = JSON.stringify(this.plugin.settings.directions, null, 2);

    new Setting(containerEl)
      .addButton(btn => btn
        .setButtonText("Save Directions")
        .setCta()
        .onClick(async () => {
          try {
            const parsed: DirectionConfig[] = JSON.parse(directionsTextArea.value);
            this.plugin.settings.directions = parsed;
            await this.plugin.saveSettings();
            new Notice("Directions saved.");
          } catch (e) {
            new Notice("Invalid JSON for directions.");
          }
        }));

    // ── LLM ──────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "LLM Provider" });

    new Setting(containerEl)
      .setName("Provider")
      .setDesc("LLM provider to use for generating digests")
      .addDropdown(drop => drop
        .addOption("openai_compatible", "OpenAI Compatible")
        .addOption("anthropic", "Anthropic")
        .setValue(this.plugin.settings.llm.provider)
        .onChange(async (value) => {
          this.plugin.settings.llm.provider = value as "openai_compatible" | "anthropic";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("API base URL (for openai_compatible; ignored for Anthropic)")
      .addText(text => text
        .setPlaceholder("https://api.openai.com/v1")
        .setValue(this.plugin.settings.llm.baseUrl)
        .onChange(async (value) => {
          this.plugin.settings.llm.baseUrl = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("Your API key")
      .addText(text => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.llm.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.llm.apiKey = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Model name (e.g. gpt-4o-mini, claude-3-5-haiku-latest)")
      .addText(text => text
        .setPlaceholder("gpt-4o-mini")
        .setValue(this.plugin.settings.llm.model)
        .onChange(async (value) => {
          this.plugin.settings.llm.model = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Temperature")
      .setDesc("LLM temperature (0.0 - 1.0)")
      .addSlider(slider => slider
        .setLimits(0, 1, 0.05)
        .setValue(this.plugin.settings.llm.temperature)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.llm.temperature = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Max Tokens")
      .setDesc("Maximum tokens for LLM response")
      .addSlider(slider => slider
        .setLimits(512, 8192, 256)
        .setValue(this.plugin.settings.llm.maxTokens)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.llm.maxTokens = value;
          await this.plugin.saveSettings();
        }));

    // ── Prompt Templates ─────────────────────────────────────────
    containerEl.createEl("h3", { text: "Daily Prompt Template" });
    containerEl.createEl("p", {
      text: "Placeholders: {{date}}, {{topDirections}}, {{papers_json}}, {{language}}",
      cls: "setting-item-description"
    });
    const dailyPromptTA = containerEl.createEl("textarea");
    dailyPromptTA.style.width = "100%";
    dailyPromptTA.style.height = "180px";
    dailyPromptTA.style.fontFamily = "monospace";
    dailyPromptTA.style.fontSize = "11px";
    dailyPromptTA.value = this.plugin.settings.llm.dailyPromptTemplate;
    new Setting(containerEl)
      .addButton(btn => btn.setButtonText("Save Daily Prompt").onClick(async () => {
        this.plugin.settings.llm.dailyPromptTemplate = dailyPromptTA.value;
        await this.plugin.saveSettings();
        new Notice("Daily prompt saved.");
      }));

    // ── Output ───────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Output" });

    new Setting(containerEl)
      .setName("Root Folder")
      .setDesc("Folder inside vault where all Paper Daily files are written")
      .addText(text => text
        .setPlaceholder("PaperDaily")
        .setValue(this.plugin.settings.rootFolder)
        .onChange(async (value) => {
          this.plugin.settings.rootFolder = value || "PaperDaily";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Language")
      .setDesc("Output language for AI-generated content")
      .addDropdown(drop => drop
        .addOption("zh", "中文 (Chinese)")
        .addOption("en", "English")
        .setValue(this.plugin.settings.language)
        .onChange(async (value) => {
          this.plugin.settings.language = value as "zh" | "en";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Include Abstract")
      .setDesc("Include paper abstracts in the raw papers list")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeAbstract)
        .onChange(async (value) => {
          this.plugin.settings.includeAbstract = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Include PDF Links")
      .setDesc("Include PDF links in output markdown")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includePdfLink)
        .onChange(async (value) => {
          this.plugin.settings.includePdfLink = value;
          await this.plugin.saveSettings();
        }));

    // ── Scheduling ────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Scheduling" });

    new Setting(containerEl)
      .setName("Daily Fetch Time")
      .setDesc("Time to run daily fetch (HH:MM, 24-hour)")
      .addText(text => text
        .setPlaceholder("08:30")
        .setValue(this.plugin.settings.schedule.dailyTime)
        .onChange(async (value) => {
          this.plugin.settings.schedule.dailyTime = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Weekly Report Day")
      .setDesc("Day of week for weekly report (0=Sun, 6=Sat)")
      .addSlider(slider => slider
        .setLimits(0, 6, 1)
        .setValue(this.plugin.settings.schedule.weeklyDay)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.schedule.weeklyDay = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Weekly Report Time")
      .setDesc("Time for weekly report (HH:MM)")
      .addText(text => text
        .setPlaceholder("18:00")
        .setValue(this.plugin.settings.schedule.weeklyTime)
        .onChange(async (value) => {
          this.plugin.settings.schedule.weeklyTime = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Monthly Report Day")
      .setDesc("Day of month for monthly report (1-28)")
      .addSlider(slider => slider
        .setLimits(1, 28, 1)
        .setValue(this.plugin.settings.schedule.monthlyDay)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.schedule.monthlyDay = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Monthly Report Time")
      .setDesc("Time for monthly report (HH:MM)")
      .addText(text => text
        .setPlaceholder("09:00")
        .setValue(this.plugin.settings.schedule.monthlyTime)
        .onChange(async (value) => {
          this.plugin.settings.schedule.monthlyTime = value;
          await this.plugin.saveSettings();
        }));

    // ── Test ─────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Test" });

    const testStatusEl = containerEl.createEl("p", {
      text: "",
      cls: "paper-daily-test-status"
    });
    testStatusEl.style.color = "var(--text-muted)";
    testStatusEl.style.fontSize = "0.9em";
    testStatusEl.style.minHeight = "1.4em";

    new Setting(containerEl)
      .setName("Run Daily Report Now")
      .setDesc("Immediately trigger a full daily fetch + AI digest and write to inbox/. Use this to verify your API key and settings are working correctly.")
      .addButton(btn => {
        btn.setButtonText("▶ Run Daily Now")
          .setCta()
          .onClick(async () => {
            btn.setButtonText("Running...").setDisabled(true);
            testStatusEl.style.color = "var(--text-muted)";
            testStatusEl.setText("Fetching papers and generating digest...");
            try {
              await this.plugin.runDaily();
              testStatusEl.style.color = "var(--color-green)";
              testStatusEl.setText("✓ Done! Check PaperDaily/inbox/ for today's file.");
            } catch (err) {
              testStatusEl.style.color = "var(--color-red)";
              testStatusEl.setText(`✗ Error: ${String(err)}`);
            } finally {
              btn.setButtonText("▶ Run Daily Now").setDisabled(false);
            }
          });
      });

    // ── Backfill ──────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Backfill" });

    new Setting(containerEl)
      .setName("Max Backfill Days")
      .setDesc("Maximum number of days allowed in a backfill range (guardrail)")
      .addSlider(slider => slider
        .setLimits(1, 90, 1)
        .setValue(this.plugin.settings.backfillMaxDays)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.backfillMaxDays = value;
          await this.plugin.saveSettings();
        }));
  }
}
