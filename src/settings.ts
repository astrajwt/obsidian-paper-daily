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
arXiv papers below have been pre-ranked by: HuggingFace upvotes → direction relevance → interest keyword weight.

## Today's top research directions (pre-computed):
{{topDirections}}

## arXiv papers to analyze (pre-ranked, with LLM scores already computed):
{{papers_json}}

## HuggingFace Daily Papers (community picks, sorted by upvotes):
{{hf_papers_json}}

---

Generate the daily digest with the following sections:

### 今日要点 / Key Takeaways
5–8 punchy bullet points covering BOTH arXiv papers AND HF community picks:
- For arXiv: what actually moved the needle today vs incremental noise
- For HF: what the community is excited about, any surprises or recurring themes
- Note any overlap: papers that appear in both arXiv results and HF daily

### 方向脉搏 / Direction Pulse
For each active direction above, one sentence: what are today's papers pushing forward?

### 今日结语 / Closing
2–3 sentences: the most important signal to watch from today's combined batch.

---
Rules:
- Be direct, not hedged. State assessments confidently.
- If a paper is heavily upvoted on HF but low relevance to directions, flag the discrepancy.
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
  interestKeywords: [
    { keyword: "rlhf", weight: 3 },
    { keyword: "ppo", weight: 2 },
    { keyword: "dpo", weight: 2 },
    { keyword: "grpo", weight: 2 },
    { keyword: "agent", weight: 3 },
    { keyword: "agentic rl", weight: 3 },
    { keyword: "kv cache", weight: 3 },
    { keyword: "speculative decoding", weight: 3 },
    { keyword: "moe", weight: 2 },
    { keyword: "pretraining", weight: 2 },
    { keyword: "scaling", weight: 2 },
    { keyword: "long context", weight: 2 },
    { keyword: "multimodal", weight: 2 },
    { keyword: "reward model", weight: 3 },
  ],
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

  trending: {
    enabled: true,
    mode: "heuristic" as "heuristic" | "llm",
    topK: 5
  },

  hfSource: {
    enabled: true,
    lookbackDays: 3,
    dedup: false
  },

  rssSource: {
    enabled: false,
    feeds: []
  },

  paperDownload: {
    savePdf: false,
  },

  arxivDetailTopK: 10,
  hfDetailTopK: 10,
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

    containerEl.createEl("h1", { text: "Paper Daily 设置 / Settings" });

    // ── arXiv Fetch ──────────────────────────────────────────────
    containerEl.createEl("h2", { text: "arXiv 论文抓取 / Fetch" });

    new Setting(containerEl)
      .setName("分类 / Categories")
      .setDesc("arXiv 分类，逗号分隔 | Comma-separated arXiv categories (e.g. cs.AI,cs.LG,cs.CL)")
      .addText(text => text
        .setPlaceholder("cs.AI,cs.LG,cs.CL")
        .setValue(this.plugin.settings.categories.join(","))
        .onChange(async (value) => {
          this.plugin.settings.categories = value.split(",").map(s => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("查询关键词 / Keywords")
      .setDesc("与分类取 AND，为空则只按分类查询 | Combined with categories via AND; leave empty to fetch by category only")
      .addText(text => text
        .setPlaceholder("reinforcement learning, agent")
        .setValue(this.plugin.settings.keywords.join(","))
        .onChange(async (value) => {
          this.plugin.settings.keywords = value.split(",").map(s => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("兴趣关键词 / Interest Keywords")
      .setDesc("每行一个，格式：keyword:weight（权重1-5，省略则默认1）| One per line: keyword:weight (weight 1–5, defaults to 1 if omitted)\n例 / e.g.:\nrlhf:3\nagent:3\nkv cache:2");
    const ikwArea = containerEl.createEl("textarea");
    ikwArea.style.width = "100%";
    ikwArea.style.height = "140px";
    ikwArea.style.fontFamily = "monospace";
    ikwArea.style.fontSize = "12px";
    ikwArea.value = this.plugin.settings.interestKeywords
      .map(k => `${k.keyword}:${k.weight}`)
      .join("\n");
    ikwArea.addEventListener("input", async () => {
      this.plugin.settings.interestKeywords = ikwArea.value
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const idx = line.lastIndexOf(":");
          if (idx > 0) {
            const kw = line.slice(0, idx).trim();
            const w = parseInt(line.slice(idx + 1).trim(), 10);
            return { keyword: kw, weight: isNaN(w) || w < 1 ? 1 : Math.min(w, 5) };
          }
          return { keyword: line, weight: 1 };
        });
      await this.plugin.saveSettings();
    });

    new Setting(containerEl)
      .setName("每日最大结果数 / Max Results Per Day")
      .setDesc("每日摘要包含的最大论文数（排名后截取）| Max papers in daily digest after ranking")
      .addSlider(slider => slider
        .setLimits(5, 100, 5)
        .setValue(this.plugin.settings.maxResultsPerDay)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.maxResultsPerDay = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("时间窗口（小时）/ Time Window (hours)")
      .setDesc("抓取过去 N 小时内的论文 | Fetch papers published within the past N hours")
      .addSlider(slider => slider
        .setLimits(12, 72, 6)
        .setValue(this.plugin.settings.timeWindowHours)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.timeWindowHours = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("排序方式 / Sort By")
      .setDesc("按提交日期或最后更新日期排序 | Sort by submission date or last updated date")
      .addDropdown(drop => drop
        .addOption("submittedDate", "Submitted Date")
        .addOption("lastUpdatedDate", "Last Updated Date")
        .setValue(this.plugin.settings.sortBy)
        .onChange(async (value) => {
          this.plugin.settings.sortBy = value as "submittedDate" | "lastUpdatedDate";
          await this.plugin.saveSettings();
        }));

    // ── Directions ───────────────────────────────────────────────
    containerEl.createEl("h2", { text: "研究方向 / Directions & Themes" });

    new Setting(containerEl)
      .setName("方向显示数 Top-K / Direction Top-K")
      .setDesc("每日摘要中展示的最多方向数 | Number of top directions shown in daily digest")
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.directionTopK)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.directionTopK = value;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl("p", {
      text: "方向 JSON（高级）— 直接编辑方向配置 | Directions JSON (advanced) — edit direction config directly:",
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
        .setButtonText("保存方向配置 / Save Directions")
        .setCta()
        .onClick(async () => {
          try {
            const parsed: DirectionConfig[] = JSON.parse(directionsTextArea.value);
            this.plugin.settings.directions = parsed;
            await this.plugin.saveSettings();
            new Notice("方向配置已保存 / Directions saved.");
          } catch (e) {
            new Notice("JSON 格式错误 / Invalid JSON for directions.");
          }
        }));

    // ── LLM ──────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "模型配置 / LLM Provider" });

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
      .setName("接口地址 / Base URL")
      .setDesc("API 端点，选择预设后自动填入 | API endpoint (auto-filled by preset; edit for custom deployments)")
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
      .setName("API 密钥 / API Key")
      .setDesc("所选服务商的 API 密钥 | Your API key for the selected provider")
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
      .setName("模型 / Model")
      .setDesc("从预设中选择，或选 Other 手动输入 | Select a preset model or choose Other to type a custom name");

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
      .setName("温度 / Temperature")
      .setDesc("模型生成温度（0 = 确定性，1 = 最大随机）| LLM temperature (0.0 = deterministic, 1.0 = most random)")
      .addSlider(slider => slider
        .setLimits(0, 1, 0.05)
        .setValue(this.plugin.settings.llm.temperature)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.llm.temperature = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("最大 Token 数 / Max Tokens")
      .setDesc("模型单次响应的最大 token 数 | Maximum tokens for LLM response")
      .addSlider(slider => slider
        .setLimits(512, 8192, 256)
        .setValue(this.plugin.settings.llm.maxTokens)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.llm.maxTokens = value;
          await this.plugin.saveSettings();
        }));

    // ── Prompt Templates ─────────────────────────────────────────
    containerEl.createEl("h3", { text: "每日摘要 Prompt 模板 / Daily Prompt Template" });
    containerEl.createEl("p", {
      text: "占位符 / Placeholders: {{date}}, {{topDirections}}, {{papers_json}}, {{language}}",
      cls: "setting-item-description"
    });
    const dailyPromptTA = containerEl.createEl("textarea");
    dailyPromptTA.style.width = "100%";
    dailyPromptTA.style.height = "180px";
    dailyPromptTA.style.fontFamily = "monospace";
    dailyPromptTA.style.fontSize = "11px";
    dailyPromptTA.value = this.plugin.settings.llm.dailyPromptTemplate;
    new Setting(containerEl)
      .addButton(btn => btn.setButtonText("保存 Prompt / Save Daily Prompt").onClick(async () => {
        this.plugin.settings.llm.dailyPromptTemplate = dailyPromptTA.value;
        await this.plugin.saveSettings();
        new Notice("每日摘要 Prompt 已保存 / Daily prompt saved.");
      }));

    // ── Output ───────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "输出格式 / Output" });

    new Setting(containerEl)
      .setName("根目录 / Root Folder")
      .setDesc("Vault 内所有 Paper Daily 文件的存放目录 | Folder inside vault where all Paper Daily files are written")
      .addText(text => text
        .setPlaceholder("PaperDaily")
        .setValue(this.plugin.settings.rootFolder)
        .onChange(async (value) => {
          this.plugin.settings.rootFolder = value || "PaperDaily";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("输出语言 / Language")
      .setDesc("AI 生成内容的语言 | Output language for AI-generated content")
      .addDropdown(drop => drop
        .addOption("zh", "中文 (Chinese)")
        .addOption("en", "English")
        .setValue(this.plugin.settings.language)
        .onChange(async (value) => {
          this.plugin.settings.language = value as "zh" | "en";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("包含摘要 / Include Abstract")
      .setDesc("在原始论文列表中显示摘要 | Include paper abstracts in the raw papers list")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeAbstract)
        .onChange(async (value) => {
          this.plugin.settings.includeAbstract = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("包含 PDF 链接 / Include PDF Links")
      .setDesc("在输出 Markdown 中包含 PDF 链接 | Include PDF links in output markdown")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includePdfLink)
        .onChange(async (value) => {
          this.plugin.settings.includePdfLink = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("arXiv 详解论文数 / arXiv Detail Top-K")
      .setDesc("每日摘要 arXiv 详解部分展示的论文数 | Number of arXiv papers shown in the detailed section")
      .addSlider(slider => slider
        .setLimits(1, 30, 1)
        .setValue(this.plugin.settings.arxivDetailTopK ?? 10)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.arxivDetailTopK = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("HuggingFace 详解论文数 / HF Detail Top-K")
      .setDesc("每日摘要 HuggingFace 详解部分展示的论文数 | Number of HF papers shown in the detailed section")
      .addSlider(slider => slider
        .setLimits(1, 30, 1)
        .setValue(this.plugin.settings.hfDetailTopK ?? 10)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.hfDetailTopK = value;
          await this.plugin.saveSettings();
        }));

    // ── Scheduling ────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "定时任务 / Scheduling" });

    new Setting(containerEl)
      .setName("每日抓取时间 / Daily Fetch Time")
      .setDesc("每天自动运行的时间（24 小时制 HH:MM）| Time to run daily fetch (HH:MM, 24-hour)")
      .addText(text => text
        .setPlaceholder("08:30")
        .setValue(this.plugin.settings.schedule.dailyTime)
        .onChange(async (value) => {
          this.plugin.settings.schedule.dailyTime = value;
          await this.plugin.saveSettings();
        }));


    // ── Test ─────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "测试 / Test" });

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
      .setName("测试 arXiv 抓取 / Test arXiv Fetch")
      .setDesc("检查 arXiv 可访问性并验证分类有结果（不调用 LLM，不写文件）| Check arXiv reachability and category results (no LLM call, no file written)")
      .addButton(btn => {
        btn.setButtonText("🔍 测试抓取 / Test Fetch")
          .onClick(async () => {
            btn.setButtonText("Fetching...").setDisabled(true);
            setStatus("正在查询 arXiv... / Querying arXiv...");
            try {
              const result = await this.plugin.testFetch();
              if (result.error) {
                setStatus(`✗ 错误 / Error: ${result.error}\n\nURL: ${result.url}`, "var(--color-red)");
              } else if (result.total === 0) {
                setStatus(`⚠ 未返回论文 / 0 papers returned\n\nURL: ${result.url}\n\n可能原因 / Possible causes:\n- 未设置分类 / Categories not set\n- 网络问题 / Network issue\n- 已全部在去重缓存中 / All papers already in dedup cache`, "var(--color-orange)");
              } else {
                setStatus(`✓ 已获取 ${result.total} 篇论文 / ${result.total} papers fetched\n\n首篇 / First: "${result.firstTitle}"\n\nURL: ${result.url}`, "var(--color-green)");
              }
            } catch (err) {
              setStatus(`✗ ${String(err)}`, "var(--color-red)");
            } finally {
              btn.setButtonText("🔍 测试抓取 / Test Fetch").setDisabled(false);
            }
          });
      });

    new Setting(containerEl)
      .setName("立即运行每日报告 / Run Daily Report Now")
      .setDesc("完整流程：抓取 + AI 摘要 + 写入 inbox/（请先确认 API Key 和配置正确）| Full pipeline: fetch + AI digest + write to inbox/. Verify your API key first.")
      .addButton(btn => {
        btn.setButtonText("▶ 立即运行 / Run Daily Now")
          .setCta()
          .onClick(async () => {
            btn.setButtonText("Running...").setDisabled(true);
            setStatus("正在抓取论文并生成摘要... / Fetching papers and generating digest...");
            try {
              await this.plugin.runDaily();
              setStatus("✓ 完成！请查看 PaperDaily/inbox/ 中今天的文件 / Done! Check PaperDaily/inbox/ for today's file.", "var(--color-green)");
            } catch (err) {
              setStatus(`✗ Error: ${String(err)}`, "var(--color-red)");
            } finally {
              btn.setButtonText("▶ 立即运行 / Run Daily Now").setDisabled(false);
            }
          });
      });

    // ── Trending ──────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "热度论文 / Trending Papers" });
    containerEl.createEl("p", {
      text: "将未命中任何关键词但热度较高的论文也纳入摘要。热度 = 版本修订次数 + 跨领域分类数 + 发布时间 + HF 点赞数 | Include high-hotness papers even if they don't match any keyword. Hotness = revision version + cross-listing + recency + HF upvotes.",
      cls: "setting-item-description"
    });

    new Setting(containerEl)
      .setName("开启热度模式 / Enable Trending Mode")
      .setDesc("在摘要末尾附加热度论文板块 | Append a Trending section with papers not matched by keywords")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.trending.enabled)
        .onChange(async (value) => {
          this.plugin.settings.trending.enabled = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("热度检测模式 / Trending Detection Mode")
      .setDesc("heuristic：基于版本修订 / 多分类 / 时效 / HF 赞数打分 | llm：大模型对摘要打分并生成详细摘要")
      .addDropdown(drop => drop
        .addOption("heuristic", "Heuristic（启发式）")
        .addOption("llm", "LLM（大模型打分）")
        .setValue(this.plugin.settings.trending.mode ?? "heuristic")
        .onChange(async (value) => {
          this.plugin.settings.trending.mode = value as "heuristic" | "llm";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("热度论文数 Top-K / Trending Top-K")
      .setDesc("每日最多展示的热度论文数 | Max number of trending papers to include per day")
      .addSlider(slider => slider
        .setLimits(1, 20, 1)
        .setValue(this.plugin.settings.trending.topK)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.trending.topK = value;
          await this.plugin.saveSettings();
        }));

    // ── HuggingFace Papers ────────────────────────────────────────
    containerEl.createEl("h2", { text: "HuggingFace 论文源 / HuggingFace Papers" });
    containerEl.createEl("p", {
      text: "从 huggingface.co/papers 抓取每日精选论文。HF 点赞数作为排名首要信号，未被 arXiv 关键词覆盖的社区精选论文也会自动补充进来 | Fetch daily featured papers from huggingface.co/papers. HF upvotes are the primary ranking signal; community picks outside your arXiv filters are added automatically.",
      cls: "setting-item-description"
    });

    new Setting(containerEl)
      .setName("开启 HuggingFace 源 / Enable HuggingFace Source")
      .setDesc("抓取 HF 每日论文并将点赞数合并到排名中 | Fetch HF daily papers and merge upvotes into scoring")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.hfSource?.enabled ?? true)
        .onChange(async (value) => {
          this.plugin.settings.hfSource = { ...this.plugin.settings.hfSource, enabled: value };
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("回溯天数 / Lookback Days")
      .setDesc("今日无数据时（如周末）往前查找最近几天的 HF 精选 | If today has no HF papers (e.g. weekend), look back up to N days")
      .addSlider(slider => slider
        .setLimits(0, 7, 1)
        .setValue(this.plugin.settings.hfSource?.lookbackDays ?? 3)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.hfSource = { ...this.plugin.settings.hfSource, lookbackDays: value };
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("跳过已出现过的 HF 精选 / Dedup HF Papers")
      .setDesc("开启后，曾在 HF 精选中出现过的论文不再重复展示；arXiv 有新版本的论文不受影响 | Skip HF papers already shown on a previous day; arXiv updates are unaffected")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.hfSource?.dedup ?? false)
        .onChange(async (value) => {
          this.plugin.settings.hfSource = { ...this.plugin.settings.hfSource, dedup: value };
          await this.plugin.saveSettings();
        }));

    // ── RSS Sources [beta] ────────────────────────────────────────
    const rssHeader = containerEl.createEl("h2");
    rssHeader.appendText("RSS 订阅源 / RSS Sources ");
    rssHeader.createEl("span", { text: "beta", cls: "paper-daily-badge-beta" });

    containerEl.createEl("p", {
      text: "订阅自定义 RSS/Atom 源（如 Semantic Scholar 提醒、期刊订阅等）。Feed 解析功能尚未激活，可提前配置 URL，后续版本将支持 | Subscribe to custom RSS/Atom feeds. Feed parsing is not yet active — configure URLs now and they will be fetched in a future update.",
      cls: "setting-item-description"
    });

    new Setting(containerEl)
      .setName("开启 RSS 源 / Enable RSS source")
      .setDesc("（Beta）开启后将在可用时包含 RSS 订阅内容 | (Beta) Toggle on to include RSS feeds when available")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.rssSource?.enabled ?? false)
        .setDisabled(true)   // grayed out until implemented
        .onChange(async (value) => {
          this.plugin.settings.rssSource = { ...this.plugin.settings.rssSource, enabled: value };
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("订阅地址 / Feed URLs")
      .setDesc("每行一个 RSS/Atom URL，Beta 功能激活后将自动解析 | One RSS/Atom URL per line. Will be parsed when beta feature activates.")
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
    containerEl.createEl("h2", { text: "PDF 下载 / PDF Download" });

    new Setting(containerEl)
      .setName("保存 PDF / Save PDF")
      .setDesc("下载论文 PDF 并存入 Vault（papers/pdf/），已下载的文件自动跳过 | Download paper PDFs into the vault (papers/pdf/). Already-downloaded files are skipped.")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.paperDownload?.savePdf ?? false)
        .onChange(async (value) => {
          this.plugin.settings.paperDownload = { ...this.plugin.settings.paperDownload, savePdf: value };
          await this.plugin.saveSettings();
        }));

    // ── Dedup Cache ───────────────────────────────────────────────
    containerEl.createEl("h2", { text: "去重缓存 / Dedup Cache" });
    new Setting(containerEl)
      .setName("清空去重缓存 / Clear Seen IDs")
      .setDesc("清空后下次运行会重新拉取所有论文 | After clearing, the next run will re-fetch all papers within the time window")
      .addButton(btn => btn
        .setButtonText("清空 / Clear")
        .setWarning()
        .onClick(async () => {
          await this.plugin.clearDedup();
          new Notice("去重缓存已清空 / Dedup cache cleared.");
        }));

    // ── Backfill ──────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "历史回填 / Backfill" });

    new Setting(containerEl)
      .setName("最大回填天数 / Max Backfill Days")
      .setDesc("单次回填允许的最大天数范围（安全上限）| Maximum number of days allowed in a backfill range (guardrail)")
      .addSlider(slider => slider
        .setLimits(1, 90, 1)
        .setValue(this.plugin.settings.backfillMaxDays)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.backfillMaxDays = value;
          await this.plugin.saveSettings();
        }));

    // ── Contact ───────────────────────────────────────────────────
    containerEl.createEl("hr");
    const contactDiv = containerEl.createDiv({ cls: "paper-daily-contact" });
    contactDiv.style.textAlign = "center";
    contactDiv.style.padding = "20px 0 12px";
    contactDiv.style.color = "var(--text-muted)";
    contactDiv.style.fontSize = "0.88em";
    contactDiv.style.lineHeight = "1.8";

    contactDiv.createEl("p", {
      text: "🤖 Paper Daily — Built for the AI research community",
    }).style.marginBottom = "4px";

    const emailLine = contactDiv.createEl("p");
    emailLine.style.marginBottom = "0";
    emailLine.appendText("📬 联系作者 / Contact me: ");
    const emailLink = emailLine.createEl("a", {
      text: "astra.jwt@gmail.com",
      href: "mailto:astra.jwt@gmail.com"
    });
    emailLink.style.color = "var(--interactive-accent)";
    emailLink.style.textDecoration = "none";
  }
}
