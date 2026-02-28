import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type PaperDailyPlugin from "./main";
import type { PaperDailySettings, DirectionConfig } from "./types/config";

interface ProviderPreset {
  label: string;
  provider: "openai_compatible" | "anthropic";
  baseUrl: string;
  models: string[];
  keyPlaceholder: string;
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  deepseek: {
    label: "DeepSeek",
    provider: "openai_compatible",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
    keyPlaceholder: "sk-..."
  },
  openai: {
    label: "OpenAI",
    provider: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
    keyPlaceholder: "sk-..."
  },
  anthropic: {
    label: "Claude",
    provider: "anthropic",
    baseUrl: "",
    models: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-opus-4-5"],
    keyPlaceholder: "sk-ant-..."
  },
  glm: {
    label: "GLM / 智谱",
    provider: "openai_compatible",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-flash", "glm-4-air", "glm-4", "glm-z1-flash"],
    keyPlaceholder: "your-zhipu-api-key"
  },
  minimax: {
    label: "MiniMax",
    provider: "openai_compatible",
    baseUrl: "https://api.minimax.chat/v1",
    models: ["MiniMax-Text-01", "abab6.5s-chat", "abab5.5-chat"],
    keyPlaceholder: "your-minimax-api-key"
  },
  moonshot: {
    label: "Moonshot / Kimi",
    provider: "openai_compatible",
    baseUrl: "https://api.moonshot.cn/v1",
    models: ["moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"],
    keyPlaceholder: "sk-..."
  },
  qwen: {
    label: "Qwen / 通义",
    provider: "openai_compatible",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen-long"],
    keyPlaceholder: "sk-..."
  },
  custom: {
    label: "Custom",
    provider: "openai_compatible",
    baseUrl: "",
    models: [],
    keyPlaceholder: "your-api-key"
  }
};

function detectPreset(baseUrl: string): string {
  for (const [key, preset] of Object.entries(PROVIDER_PRESETS)) {
    if (key === "custom") continue;
    if (preset.baseUrl && baseUrl.startsWith(preset.baseUrl)) return key;
  }
  return baseUrl ? "custom" : "deepseek";
}

export const DEFAULT_DAILY_PROMPT = `You are a senior AI/ML research analyst with deep expertise in LLM systems, RL, and AI infrastructure. You are opinionated, precise, and engineering-focused.

Today: {{date}}
Output language: {{language}}

## Context
Papers below have been pre-ranked by three signals (in priority order):
1. **HuggingFace community upvotes** — real-time signal of what the AI community finds impactful. Papers with hfUpvotes > 0 were featured on huggingface.co/papers.
2. **Direction relevance score** — keyword match strength against configured research directions.
3. **Interest keyword hits** — alignment with user-specified interest keywords.

## Today's top research directions (pre-computed):
{{topDirections}}

## Papers to analyze (JSON, pre-ranked):
{{papers_json}}

---

Generate the daily digest with the following sections:

### 今日要点 / Key Takeaways
3–5 punchy bullet points. What actually moved the needle today vs what is incremental noise? Be direct.

### 方向脉搏 / Direction Pulse
For each active direction above, one sentence: what are today's papers collectively pushing forward, and is the direction accelerating or plateauing?

### 精选论文 / Curated Papers
For **each paper** in the list, output exactly this structure:

**[N]. {title}**
- 🤗 HF 活跃度: {hfUpvotes} upvotes — {brief interpretation: e.g. "社区高度关注" / "小众但相关" / "未上榜"}
- ⭐ 价值评级: {★★★★★ to ★☆☆☆☆}  ({one-phrase reason})
- 🧭 方向: {matched directions}  |  关键词: {interest hits}
- 💡 核心贡献: one sentence, technically specific — what exactly did they do / prove / build?
- 🔧 工程启示: what can a practitioner/engineer take away or act on?
- ⚠️ 局限性: honest weaknesses — scope, baselines, reproducibility, etc.
- 🔗 {links}

Value rating guide — be calibrated, not generous:
★★★★★  Breakthrough: likely to shift practice or become a citation anchor
★★★★☆  Strong: clear improvement, solid evaluation, worth reading in full
★★★☆☆  Solid: incremental but honest; good for domain awareness
★★☆☆☆  Weak: narrow scope, questionable baselines, or limited novelty
★☆☆☆☆  Skip: below standard, off-topic, or superseded

### 今日结语 / Closing
2–3 sentences: what's the most important thing to keep an eye on from today's batch?

---
Rules:
- Do NOT hedge every sentence. State your assessment directly.
- If hfUpvotes is high but direction relevance is low, note the discrepancy.
- If a paper seems overhyped relative to its technical content, say so.
- Keep engineering perspective front and center.`;

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
  interestKeywords: ["rlhf", "ppo", "dpo", "grpo", "agent", "agentic rl", "kv cache", "speculative decoding", "moe", "pretraining", "scaling", "long context", "multimodal", "reward model"],
  maxResultsPerDay: 20,
  sortBy: "submittedDate",
  timeWindowHours: 72,

  directions: [
    {
      name: "RLHF & Post-training",
      weight: 1.5,
      match: {
        keywords: ["rlhf", "ppo", "dpo", "grpo", "reward model", "preference", "post-training", "alignment", "rlaif", "constitutional ai"],
        categories: ["cs.AI", "cs.LG"]
      }
    },
    {
      name: "Agentic RL",
      weight: 1.4,
      match: {
        keywords: ["agentic rl", "agent", "tool use", "tool call", "planner", "react", "function calling", "multi-agent", "agentic", "self-play", "verifier"],
        categories: ["cs.AI"]
      }
    },
    {
      name: "Pre-training",
      weight: 1.4,
      match: {
        keywords: ["pretraining", "pre-training", "scaling law", "data curation", "tokenizer", "continual learning", "continual pretraining", "foundation model", "corpus", "training data"],
        categories: ["cs.LG", "cs.CL"]
      }
    },
    {
      name: "Inference Serving",
      weight: 1.3,
      match: {
        keywords: ["kv cache", "pagedattention", "speculative decoding", "speculative", "vllm", "sglang", "tensorrt", "inference serving", "throughput", "latency", "prefill", "decode"],
        categories: ["cs.DC", "cs.AR"]
      }
    },
    {
      name: "Training Systems",
      weight: 1.2,
      match: {
        keywords: ["fsdp", "zero", "deepspeed", "megatron", "pipeline parallel", "tensor parallel", "checkpoint", "distributed training", "communication overhead"],
        categories: ["cs.DC"]
      }
    },
    {
      name: "MoE",
      weight: 1.2,
      match: {
        keywords: ["moe", "mixture of experts", "expert", "alltoall", "routing", "sparse", "load balancing"],
        categories: ["cs.LG", "cs.AI"]
      }
    },
    {
      name: "Long Context & Efficiency",
      weight: 1.2,
      match: {
        keywords: ["long context", "context length", "context window", "position encoding", "rope", "flash attention", "linear attention", "mamba", "ssm", "state space model", "recurrent"],
        categories: ["cs.LG", "cs.CL"]
      }
    },
    {
      name: "Multimodal",
      weight: 1.1,
      match: {
        keywords: ["multimodal", "vision language", "vlm", "image generation", "diffusion model", "text-to-image", "clip", "vit", "visual", "video generation"],
        categories: ["cs.CV", "cs.LG"]
      }
    },
    {
      name: "Quantization & Compression",
      weight: 1.1,
      match: {
        keywords: ["quantization", "pruning", "knowledge distillation", "compression", "int4", "int8", "gguf", "sparsity", "efficient inference", "model compression"],
        categories: ["cs.LG", "cs.AR"]
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
    dailyTime: "08:30"
  },

  backfillMaxDays: 30,

  vaultLinking: {
    enabled: true,
    excludeFolders: ["PaperDaily", "Clippings", "Readwise", "templates"],
    maxLinksPerPaper: 3
  },

  trending: {
    enabled: true,
    topK: 5,
    minHotness: 2
  },

  hfSource: {
    enabled: true
  },

  rssSource: {
    enabled: false,
    feeds: []
  },

  paperDownload: {
    saveHtml: false,
    savePdf: false,
    maxPapers: 5
  }
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

    // ── Preset buttons ───────────────────────────────────────────
    const presetWrap = containerEl.createDiv({ cls: "paper-daily-preset-wrap" });
    presetWrap.style.display = "flex";
    presetWrap.style.flexWrap = "wrap";
    presetWrap.style.gap = "6px";
    presetWrap.style.marginBottom = "16px";

    let activePreset = detectPreset(this.plugin.settings.llm.baseUrl);

    // refs updated by preset selection
    let baseUrlInput: HTMLInputElement;
    let modelSelect: HTMLSelectElement;
    let customModelInput: HTMLInputElement;
    let modelCustomRow: HTMLElement;
    let apiKeyInput: HTMLInputElement;

    const renderModelOptions = (presetKey: string) => {
      if (!modelSelect) return;
      const preset = PROVIDER_PRESETS[presetKey];
      modelSelect.empty();
      for (const m of preset.models) {
        const opt = modelSelect.createEl("option", { text: m, value: m });
        if (m === this.plugin.settings.llm.model) opt.selected = true;
      }
      const customOpt = modelSelect.createEl("option", { text: "Other (custom)...", value: "__custom__" });
      // if current model not in preset list, select custom
      if (!preset.models.includes(this.plugin.settings.llm.model)) {
        customOpt.selected = true;
        if (modelCustomRow) modelCustomRow.style.display = "";
        if (customModelInput) customModelInput.value = this.plugin.settings.llm.model;
      } else {
        if (modelCustomRow) modelCustomRow.style.display = "none";
      }
    };

    const applyPreset = async (presetKey: string) => {
      activePreset = presetKey;
      const preset = PROVIDER_PRESETS[presetKey];
      this.plugin.settings.llm.provider = preset.provider;
      if (preset.baseUrl) {
        this.plugin.settings.llm.baseUrl = preset.baseUrl;
        if (baseUrlInput) baseUrlInput.value = preset.baseUrl;
      }
      if (apiKeyInput) apiKeyInput.placeholder = preset.keyPlaceholder;
      renderModelOptions(presetKey);
      // pick first model if current model not in new preset
      if (preset.models.length > 0 && !preset.models.includes(this.plugin.settings.llm.model)) {
        this.plugin.settings.llm.model = preset.models[0];
        if (modelSelect) modelSelect.value = preset.models[0];
        if (modelCustomRow) modelCustomRow.style.display = "none";
      }
      // refresh button styles
      presetWrap.querySelectorAll(".paper-daily-preset-btn").forEach(b => {
        const el = b as HTMLElement;
        if (el.dataset.preset === presetKey) {
          el.style.opacity = "1";
          el.style.fontWeight = "600";
          el.style.borderColor = "var(--interactive-accent)";
          el.style.color = "var(--interactive-accent)";
        } else {
          el.style.opacity = "0.6";
          el.style.fontWeight = "400";
          el.style.borderColor = "var(--background-modifier-border)";
          el.style.color = "var(--text-normal)";
        }
      });
      await this.plugin.saveSettings();
    };

    for (const [key, preset] of Object.entries(PROVIDER_PRESETS)) {
      const btn = presetWrap.createEl("button", {
        text: preset.label,
        cls: "paper-daily-preset-btn"
      });
      btn.dataset.preset = key;
      btn.style.padding = "4px 12px";
      btn.style.borderRadius = "6px";
      btn.style.border = "1px solid var(--background-modifier-border)";
      btn.style.cursor = "pointer";
      btn.style.fontSize = "0.85em";
      btn.style.background = "var(--background-secondary)";
      btn.style.transition = "all 0.15s";
      if (key === activePreset) {
        btn.style.opacity = "1";
        btn.style.fontWeight = "600";
        btn.style.borderColor = "var(--interactive-accent)";
        btn.style.color = "var(--interactive-accent)";
      } else {
        btn.style.opacity = "0.6";
        btn.style.color = "var(--text-normal)";
      }
      btn.addEventListener("click", () => applyPreset(key));
    }

    // ── Base URL ─────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("API endpoint (auto-filled by preset; edit for custom deployments)")
      .addText(text => {
        baseUrlInput = text.inputEl;
        text
          .setPlaceholder("https://api.openai.com/v1")
          .setValue(this.plugin.settings.llm.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.llm.baseUrl = value;
            await this.plugin.saveSettings();
          });
      });

    // ── API Key ──────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("API Key")
      .setDesc("Your API key for the selected provider")
      .addText(text => {
        apiKeyInput = text.inputEl;
        text.inputEl.type = "password";
        text.inputEl.placeholder = PROVIDER_PRESETS[activePreset]?.keyPlaceholder ?? "sk-...";
        text.inputEl.value = this.plugin.settings.llm.apiKey;
        // Use native "input" event — Obsidian's onChange can be unreliable on password fields
        text.inputEl.addEventListener("input", async () => {
          this.plugin.settings.llm.apiKey = text.inputEl.value;
          await this.plugin.saveSettings();
        });
      });

    // ── Model dropdown ───────────────────────────────────────────
    const modelSetting = new Setting(containerEl)
      .setName("Model")
      .setDesc("Select a preset model or choose Other to type a custom name");

    modelSetting.controlEl.style.flexDirection = "column";
    modelSetting.controlEl.style.alignItems = "flex-start";
    modelSetting.controlEl.style.gap = "6px";

    modelSelect = modelSetting.controlEl.createEl("select");
    modelSelect.style.width = "100%";
    modelSelect.style.padding = "4px 6px";
    modelSelect.style.borderRadius = "4px";
    modelSelect.style.border = "1px solid var(--background-modifier-border)";
    modelSelect.style.background = "var(--background-primary)";
    modelSelect.style.color = "var(--text-normal)";
    modelSelect.style.fontSize = "0.9em";

    modelCustomRow = modelSetting.controlEl.createDiv();
    modelCustomRow.style.width = "100%";
    modelCustomRow.style.display = "none";
    customModelInput = modelCustomRow.createEl("input", { type: "text" });
    customModelInput.placeholder = "Enter model name...";
    customModelInput.style.width = "100%";
    customModelInput.style.padding = "4px 6px";
    customModelInput.style.borderRadius = "4px";
    customModelInput.style.border = "1px solid var(--background-modifier-border)";
    customModelInput.style.background = "var(--background-primary)";
    customModelInput.style.color = "var(--text-normal)";
    customModelInput.style.fontSize = "0.9em";
    customModelInput.addEventListener("input", async () => {
      this.plugin.settings.llm.model = customModelInput.value;
      await this.plugin.saveSettings();
    });

    renderModelOptions(activePreset);

    modelSelect.addEventListener("change", async () => {
      if (modelSelect.value === "__custom__") {
        modelCustomRow.style.display = "";
        customModelInput.focus();
      } else {
        modelCustomRow.style.display = "none";
        this.plugin.settings.llm.model = modelSelect.value;
        await this.plugin.saveSettings();
      }
    });

    // ── Temperature + Max Tokens ─────────────────────────────────
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


    // ── Test ─────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Test" });

    const testStatusEl = containerEl.createEl("pre", { text: "" });
    testStatusEl.style.color = "var(--text-muted)";
    testStatusEl.style.fontSize = "0.82em";
    testStatusEl.style.whiteSpace = "pre-wrap";
    testStatusEl.style.wordBreak = "break-all";
    testStatusEl.style.background = "var(--background-secondary)";
    testStatusEl.style.padding = "8px 10px";
    testStatusEl.style.borderRadius = "6px";
    testStatusEl.style.minHeight = "1.8em";
    testStatusEl.style.display = "none";

    const setStatus = (text: string, color = "var(--text-muted)") => {
      testStatusEl.style.display = "";
      testStatusEl.style.color = color;
      testStatusEl.setText(text);
    };

    new Setting(containerEl)
      .setName("Test arXiv Fetch")
      .setDesc("Check that arXiv is reachable and your categories return results (no LLM call, no file written)")
      .addButton(btn => {
        btn.setButtonText("🔍 Test Fetch")
          .onClick(async () => {
            btn.setButtonText("Fetching...").setDisabled(true);
            setStatus("Querying arXiv...");
            try {
              const result = await this.plugin.testFetch();
              if (result.error) {
                setStatus(`✗ Error: ${result.error}\n\nURL: ${result.url}`, "var(--color-red)");
              } else if (result.total === 0) {
                setStatus(`⚠ 0 papers returned\n\nURL: ${result.url}\n\nPossible causes:\n- Categories not set (check arXiv Fetch settings)\n- Network issue\n- All papers already in dedup cache`, "var(--color-orange)");
              } else {
                setStatus(`✓ ${result.total} papers fetched\n\nFirst: "${result.firstTitle}"\n\nURL: ${result.url}`, "var(--color-green)");
              }
            } catch (err) {
              setStatus(`✗ ${String(err)}`, "var(--color-red)");
            } finally {
              btn.setButtonText("🔍 Test Fetch").setDisabled(false);
            }
          });
      });

    new Setting(containerEl)
      .setName("Run Daily Report Now")
      .setDesc("Full pipeline: fetch + AI digest + write to inbox/. Verify your API key and settings are correct first.")
      .addButton(btn => {
        btn.setButtonText("▶ Run Daily Now")
          .setCta()
          .onClick(async () => {
            btn.setButtonText("Running...").setDisabled(true);
            setStatus("Fetching papers and generating digest...");
            try {
              await this.plugin.runDaily();
              setStatus("✓ Done! Check PaperDaily/inbox/ for today's file.", "var(--color-green)");
            } catch (err) {
              setStatus(`✗ Error: ${String(err)}`, "var(--color-red)");
            } finally {
              btn.setButtonText("▶ Run Daily Now").setDisabled(false);
            }
          });
      });

    // ── Trending ──────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Trending Papers" });
    containerEl.createEl("p", {
      text: "Include high-hotness papers even if they don't match any interest keyword or direction. Hotness = version number + cross-listing breadth + recency.",
      cls: "setting-item-description"
    });

    new Setting(containerEl)
      .setName("Enable Trending Mode")
      .setDesc("Append a Trending section with zero-keyword-match papers that score high on hotness")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.trending.enabled)
        .onChange(async (value) => {
          this.plugin.settings.trending.enabled = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Trending Top-K")
      .setDesc("Max number of trending papers to include per day")
      .addSlider(slider => slider
        .setLimits(1, 20, 1)
        .setValue(this.plugin.settings.trending.topK)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.trending.topK = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Minimum Hotness Score")
      .setDesc("Papers below this score are ignored (max possible is 9: v4+ revised + 4 categories + <24h)")
      .addSlider(slider => slider
        .setLimits(1, 9, 1)
        .setValue(this.plugin.settings.trending.minHotness)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.trending.minHotness = value;
          await this.plugin.saveSettings();
        }));

    // ── Vault Linking ─────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Vault Linking" });
    containerEl.createEl("p", {
      text: "Automatically find related notes in your vault and add [[wikilinks]] to each paper in the daily digest.",
      cls: "setting-item-description"
    });

    new Setting(containerEl)
      .setName("Enable Vault Linking")
      .setDesc("Scan vault notes and link related ones to each paper")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.vaultLinking.enabled)
        .onChange(async (value) => {
          this.plugin.settings.vaultLinking.enabled = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Exclude Folders")
      .setDesc("Comma-separated folder names to skip when building the index")
      .addText(text => text
        .setPlaceholder("PaperDaily,Clippings,Readwise")
        .setValue(this.plugin.settings.vaultLinking.excludeFolders.join(","))
        .onChange(async (value) => {
          this.plugin.settings.vaultLinking.excludeFolders = value.split(",").map(s => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Max Links Per Paper")
      .setDesc("Maximum number of related notes shown per paper")
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.vaultLinking.maxLinksPerPaper)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.vaultLinking.maxLinksPerPaper = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Rebuild Note Index")
      .setDesc("Re-scan vault to update the note index (run after adding new notes)")
      .addButton(btn => btn
        .setButtonText("Rebuild Index")
        .onClick(async () => {
          btn.setButtonText("Scanning...").setDisabled(true);
          try {
            await this.plugin.rebuildLinkingIndex();
            new Notice("Vault index rebuilt.");
          } finally {
            btn.setButtonText("Rebuild Index").setDisabled(false);
          }
        }));

    // ── HuggingFace Papers ────────────────────────────────────────
    containerEl.createEl("h2", { text: "HuggingFace Papers" });
    containerEl.createEl("p", {
      text: "Fetch today's featured papers from huggingface.co/papers. Papers are community-curated with upvote counts. Upvotes boost hotness scoring and papers not in your arXiv results are added as a bonus source.",
      cls: "setting-item-description"
    });

    new Setting(containerEl)
      .setName("Enable HuggingFace Source")
      .setDesc("Fetch HF daily papers and merge upvotes into scoring")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.hfSource?.enabled ?? true)
        .onChange(async (value) => {
          this.plugin.settings.hfSource = { ...this.plugin.settings.hfSource, enabled: value };
          await this.plugin.saveSettings();
        }));

    // ── RSS Sources [beta] ────────────────────────────────────────
    const rssHeader = containerEl.createEl("h2");
    rssHeader.appendText("RSS Sources ");
    rssHeader.createEl("span", { text: "beta", cls: "paper-daily-badge-beta" });

    containerEl.createEl("p", {
      text: "Subscribe to custom RSS/Atom feeds (e.g. semantic scholar alerts, journal feeds). Feed parsing is not yet active — configure URLs now and they will be fetched in a future update.",
      cls: "setting-item-description"
    });

    new Setting(containerEl)
      .setName("Enable RSS source")
      .setDesc("(Beta) Toggle on to include RSS feeds when available")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.rssSource?.enabled ?? false)
        .setDisabled(true)   // grayed out until implemented
        .onChange(async (value) => {
          this.plugin.settings.rssSource = { ...this.plugin.settings.rssSource, enabled: value };
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Feed URLs")
      .setDesc("One RSS/Atom URL per line. Will be parsed when beta feature activates.")
      .addTextArea(area => {
        area.setPlaceholder("https://export.arxiv.org/rss/cs.AI\nhttps://example.com/feed.xml");
        area.setValue((this.plugin.settings.rssSource?.feeds ?? []).join("\n"));
        area.inputEl.rows = 4;
        area.inputEl.addEventListener("input", async () => {
          const feeds = area.inputEl.value
            .split("\n")
            .map(s => s.trim())
            .filter(Boolean);
          this.plugin.settings.rssSource = { ...this.plugin.settings.rssSource, feeds };
          await this.plugin.saveSettings();
        });
      });

    // ── Paper Download ────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Paper Download" });
    containerEl.createEl("p", {
      text: "Download the full text of top-ranked papers. HTML is converted to Markdown and saved under papers/html/. PDFs are saved under papers/pdf/. Already-downloaded files are skipped.",
      cls: "setting-item-description"
    });

    new Setting(containerEl)
      .setName("Save HTML as Markdown")
      .setDesc("Fetch the arXiv HTML version and save as a .md file (requires HTML version to exist on arXiv)")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.paperDownload?.saveHtml ?? false)
        .onChange(async (value) => {
          this.plugin.settings.paperDownload = { ...this.plugin.settings.paperDownload, saveHtml: value };
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Save PDF")
      .setDesc("Download the PDF and save it in the vault (viewable in Obsidian)")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.paperDownload?.savePdf ?? false)
        .onChange(async (value) => {
          this.plugin.settings.paperDownload = { ...this.plugin.settings.paperDownload, savePdf: value };
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Max papers to download per day")
      .setDesc("Limit downloads to top-N ranked papers to avoid long wait times")
      .addSlider(slider => slider
        .setLimits(1, 30, 1)
        .setValue(this.plugin.settings.paperDownload?.maxPapers ?? 5)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.paperDownload = { ...this.plugin.settings.paperDownload, maxPapers: value };
          await this.plugin.saveSettings();
        }));

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
