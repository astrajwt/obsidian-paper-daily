import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type PaperDailyPlugin from "./main";
import type { PaperDailySettings, PromptTemplate } from "./types/config";

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
Papers below (arXiv + HF) have been pre-ranked by: HuggingFace upvotes → interest keyword weight.

## Papers to analyze (pre-ranked, arXiv + HF):
{{papers_json}}
{{fulltext_section}}
{{local_pdfs}}
## HuggingFace Daily Papers (community picks, sorted by upvotes):
{{hf_papers_json}}

---

Generate the daily digest with the following sections:

### 今日要点 / Key Takeaways
3–5 punchy bullet points. What actually moved the needle today vs what is incremental noise? Note any papers appearing in both arXiv results and HF daily. Be direct.

### 精选论文 / Curated Papers
For **each paper** in the list, output exactly this structure:

**[N]. {title}**
- ⭐ 价值评级: {★★★★★ to ★☆☆☆☆}  ({one-phrase reason})
- 关键词: {interest hits}
- 💡 核心贡献: one sentence, technically specific — what exactly did they do / prove / build?
- 🔧 工程启示: what can a practitioner/engineer take away or act on? Be concrete. If full paper text is available above, draw from methods/experiments rather than just the abstract.
- ⚠️ 局限性: honest weaknesses — scope, baselines, reproducibility, generalization, etc.
- 🔗 {links from the paper data}

Value rating guide — be calibrated, not generous:
★★★★★  Breakthrough: likely to shift practice or become a citation anchor
★★★★☆  Strong: clear improvement, solid evaluation, worth reading in full
★★★☆☆  Solid: incremental but honest; good for domain awareness
★★☆☆☆  Weak: narrow scope, questionable baselines, or limited novelty
★☆☆☆☆  Skip: below standard, off-topic, or superseded

### HF 社区信号 / HF Community Signal
From the HuggingFace daily picks, list any papers NOT already covered above that are worth noting. One line each: title + why the community is upvoting it + your take on whether it lives up to the hype.

### 今日结语 / Closing
2–3 sentences: the most important thing to keep an eye on from today's batch.

---
Rules:
- Do NOT hedge every sentence. State your assessment directly.
- If hfUpvotes is high but interest keyword relevance is low, note the discrepancy.
- If a paper seems overhyped relative to its technical content, say so.
- Keep engineering perspective front and center.
- 工程启示 must be actionable — not "this is interesting" but "you can use X to achieve Y in your system".`;

export const DEFAULT_QUICKSCAN_PROMPT = `You are a senior AI/ML research analyst. Be concise and opinionated. No fluff.

Today: {{date}}
Output language: {{language}}

## Papers (pre-ranked):
{{papers_json}}
{{fulltext_section}}
{{local_pdfs}}
## HuggingFace Daily:
{{hf_papers_json}}

---

### 今日速览 / Quick Scan
For each arXiv paper, one line each — no exceptions, no skipping:
**N. Title** — one sentence: what they did and whether it matters (be direct; say "incremental" or "skip" if warranted).

### HF 热点 / HF Highlights
Top 3–5 HF picks not already covered above: title + one-line verdict on whether the community hype is warranted.

### 今日结语 / Closing
One sentence. The single most important thing from today.

---
Rules: Be blunt. Shorter is better. No per-paper section breakdowns.`;

export const DEFAULT_REVIEW_PROMPT = `You are a rigorous peer reviewer at a top AI conference (NeurIPS/ICML/ICLR). Evaluate research quality critically and fairly.

Today: {{date}}
Output language: {{language}}

## Papers to review:
{{papers_json}}
{{fulltext_section}}
{{local_pdfs}}

---

### 技术评审 / Technical Review

For **each paper** in the list:

**[N]. {title}**
- 🔬 方法核心 / Method: What is the key technical novelty? Is it principled or ad hoc? Any theoretical guarantees?
- 📊 实验严谨性 / Rigor: Are baselines fair and up-to-date? Are ablations sufficient? Any obvious cherry-picking?
- 📈 结果可信度 / Credibility: How strong is the evidence? What controls are missing? Is the gain meaningful in practice?
- 🔁 可复现性 / Reproducibility: Code released? Compute requirements? Can a grad student replicate this in a week?
- 📚 建议 / Recommendation: {Skip | Read abstract | Skim methods | Read in full | Implement & test}

### 今日批次质量评估 / Batch Quality Assessment
2–3 sentences: Is today a high-signal or low-signal day? What's the overall quality distribution? Any standout outliers?

---
Rules:
- Be skeptical but fair. Avoid enthusiasm not backed by evidence.
- Call out benchmark overfitting, p-hacking, insufficient baselines, or vague claims explicitly.
- Recommendations must be specific — no "interesting direction" hedging.`;

export const DEFAULT_DEEP_READ_PROMPT = `You are a senior AI/ML research analyst. Analyze the following paper concisely.

Title: {{title}}
Authors: {{authors}}
Interest keyword hits: {{interest_hits}}
Abstract: {{abstract}}

Full paper HTML (read directly if you can access URLs): {{fulltext}}

Provide a structured analysis with these sections:

**核心贡献 / Core Contribution** (2–3 sentences): What exactly is built, proved, or demonstrated? Be specific with method/dataset names and key numbers.

**方法亮点 / Method Highlights** (2–4 bullet points): Key technical choices, algorithmic novelty, or system design decisions.

**实验与结果 / Experiments & Results** (2–3 sentences): Which benchmarks? Headline numbers vs baselines?

**工程启示 / Engineering Takeaway** (1–2 sentences): What can a practitioner adopt from this work?

**局限性 / Limitations** (1–2 sentences): Honest scope limitations or reproducibility concerns.

Keep the total under 400 words. Be direct and opinionated. Output in {{language}}.`;

export const DEFAULT_PROMPT_LIBRARY: PromptTemplate[] = [
  { id: "builtin_engineering", name: "工程精读", prompt: DEFAULT_DAILY_PROMPT, builtin: true },
  { id: "builtin_quickscan",   name: "速览",     prompt: DEFAULT_QUICKSCAN_PROMPT, builtin: true },
  { id: "builtin_review",      name: "技术评审", prompt: DEFAULT_REVIEW_PROMPT, builtin: true },
];


export const DEFAULT_SETTINGS: PaperDailySettings = {
  categories: ["cs.AI", "cs.LG", "cs.CL"],
  // Matching is case-insensitive (keywords are lowercased before comparison)
  interestKeywords: [
    { keyword: "rlhf", weight: 5 },
    { keyword: "agent", weight: 5 },
    { keyword: "kv cache", weight: 4 },
    { keyword: "speculative decoding", weight: 4 },
    { keyword: "moe", weight: 4 },
    { keyword: "inference serving", weight: 4 },
    { keyword: "reasoning", weight: 3 },
    { keyword: "post-training", weight: 3 },
    { keyword: "distillation", weight: 3 },
    { keyword: "quantization", weight: 3 },
  ],
  maxResultsPerDay: 20,
  sortBy: "submittedDate",
  timeWindowHours: 72,

  llm: {
    provider: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 4096,
    dailyPromptTemplate: DEFAULT_DAILY_PROMPT,
  },

  rootFolder: "PaperDaily",
  language: "zh",
  includeAbstract: true,
  includePdfLink: true,

  schedule: {
    dailyTime: "08:30"
  },

  backfillMaxDays: 30,

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
    savePdf: true,
  },

  arxivDetailTopK: 10,
  hfDetailTopK: 10,

  deepRead: {
    enabled: false,
    topN: 5,
    deepReadMaxTokens: 1024,
    // deepReadPromptTemplate intentionally omitted → pipeline falls back to DEFAULT_DEEP_READ_PROMPT
  },

  promptLibrary: DEFAULT_PROMPT_LIBRARY.map(t => ({ ...t })),
  activePromptId: "builtin_review",
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

    // ── Interest Keywords ─────────────────────────────────────────
    containerEl.createEl("h2", { text: "兴趣关键词 / Interest Keywords" });
    containerEl.createEl("p", {
      text: "用于论文打分与高亮显示，权重越高排名越靠前。匹配不区分大小写。",
      cls: "setting-item-description"
    });

    const kwListEl = containerEl.createDiv();
    const renderKwList = () => {
      kwListEl.empty();
      const kws = this.plugin.settings.interestKeywords;
      kws.forEach((kw, i) => {
        new Setting(kwListEl)
          .addText(text => text
            .setPlaceholder("keyword")
            .setValue(kw.keyword)
            .onChange(async (val) => {
              kws[i].keyword = val.trim();
              await this.plugin.saveSettings();
            }))
          .addSlider(slider => slider
            .setLimits(1, 5, 1)
            .setValue(kw.weight)
            .setDynamicTooltip()
            .onChange(async (val) => {
              kws[i].weight = val;
              await this.plugin.saveSettings();
            }))
          .addExtraButton(btn => btn
            .setIcon("trash")
            .setTooltip("Remove")
            .onClick(async () => {
              kws.splice(i, 1);
              await this.plugin.saveSettings();
              renderKwList();
            }));
      });
    };
    renderKwList();

    new Setting(containerEl)
      .addButton(btn => btn
        .setButtonText("+ 添加关键词")
        .setCta()
        .onClick(async () => {
          this.plugin.settings.interestKeywords.push({ keyword: "", weight: 3 });
          await this.plugin.saveSettings();
          renderKwList();
        }));

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

    // ── Prompt Templates (tabbed library) ────────────────────────
    containerEl.createEl("h3", { text: "Prompt 模板库 / Prompt Library" });
    {
      const desc = containerEl.createEl("div", { cls: "setting-item-description" });
      desc.createEl("p", { text: "点击 Tab 切换并激活模板。可用占位符：" });
      const table = desc.createEl("table");
      table.style.fontSize = "11px";
      table.style.borderCollapse = "collapse";
      table.style.width = "100%";
      const rows: [string, string][] = [
        ["{{date}}", "当日日期，格式 YYYY-MM-DD"],
        ["{{papers_json}}", "排名后的 arXiv + HF 论文列表（JSON），每篇含 id / title / abstract / interestHits / hfUpvotes / links 等字段，最多 10 篇"],
        ["{{hf_papers_json}}", "HuggingFace Daily Papers 原始列表（JSON），含 title / hfUpvotes / streakDays，最多 15 条"],
        ["{{fulltext_section}}", "Deep Read 精读结果（Markdown）；每篇通过 arxiv.org/html URL 让模型直接读原文并生成分析；未开启 Deep Read 时为空"],
        ["{{local_pdfs}}", "当日已下载到本地的 PDF 列表（Markdown 链接）；未开启 PDF 下载时为空字符串"],
        ["{{language}}", "输出语言，由设置中'语言'选项决定，值为 Chinese (中文) 或 English"],
      ];
      for (const [ph, explain] of rows) {
        const tr = table.createEl("tr");
        const td1 = tr.createEl("td");
        td1.style.padding = "2px 8px 2px 0";
        td1.style.whiteSpace = "nowrap";
        td1.style.fontFamily = "monospace";
        td1.style.color = "var(--text-accent)";
        td1.setText(ph);
        const td2 = tr.createEl("td");
        td2.style.padding = "2px 0";
        td2.style.color = "var(--text-muted)";
        td2.setText(explain);
      }
      desc.style.marginBottom = "10px";

      // Ensure library is initialized
      if (!this.plugin.settings.promptLibrary || this.plugin.settings.promptLibrary.length === 0) {
        this.plugin.settings.promptLibrary = DEFAULT_PROMPT_LIBRARY.map(t => ({ ...t }));
        this.plugin.settings.activePromptId = "builtin_engineering";
      }
      if (!this.plugin.settings.activePromptId) {
        this.plugin.settings.activePromptId = this.plugin.settings.promptLibrary[0].id;
      }

      let selectedId = this.plugin.settings.activePromptId;

      const tabBar = containerEl.createDiv();
      tabBar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;align-items:center;";

      const promptTA = containerEl.createEl("textarea");
      promptTA.style.cssText = "width:100%;height:300px;font-family:monospace;font-size:11px;padding:8px;resize:vertical;box-sizing:border-box;";

      const actionsRow = containerEl.createDiv();
      actionsRow.style.cssText = "display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center;";

      const renderTabs = () => {
        tabBar.empty();
        const lib = this.plugin.settings.promptLibrary!;
        for (const tpl of lib) {
          const isSelected = tpl.id === selectedId;
          const btn = tabBar.createEl("button", { text: tpl.name });
          const accent = "var(--interactive-accent)";
          const border = "var(--background-modifier-border)";
          btn.style.cssText = [
            "padding:5px 14px",
            "border-radius:5px",
            "cursor:pointer",
            "font-size:0.85em",
            `border:2px solid ${isSelected ? accent : border}`,
            `background:${isSelected ? accent : "var(--background-secondary)"}`,
            `color:${isSelected ? "var(--text-on-accent)" : "var(--text-normal)"}`,
            "font-weight:" + (isSelected ? "600" : "400"),
            "transition:all 0.1s",
          ].join(";");
          btn.onclick = () => {
            selectedId = tpl.id;
            this.plugin.settings.activePromptId = tpl.id;
            this.plugin.saveSettings();
            promptTA.value = tpl.prompt;
            renderTabs();
            renderActions();
          };
        }
        // Add new template button
        const addBtn = tabBar.createEl("button", { text: "＋ 新建" });
        addBtn.style.cssText = "padding:5px 12px;border-radius:5px;cursor:pointer;font-size:0.85em;border:2px dashed var(--background-modifier-border);background:transparent;color:var(--text-muted);";
        addBtn.onclick = async () => {
          const lib2 = this.plugin.settings.promptLibrary!;
          const newTpl: PromptTemplate = {
            id: `custom_${Date.now()}`,
            name: `自定义 ${lib2.filter(t => !t.builtin).length + 1}`,
            prompt: DEFAULT_DAILY_PROMPT,
          };
          lib2.push(newTpl);
          selectedId = newTpl.id;
          this.plugin.settings.activePromptId = newTpl.id;
          await this.plugin.saveSettings();
          promptTA.value = newTpl.prompt;
          renderTabs();
          renderActions();
        };
      };

      const renderActions = () => {
        actionsRow.empty();
        const lib = this.plugin.settings.promptLibrary!;
        const tpl = lib.find(t => t.id === selectedId);
        if (!tpl) return;

        // Save
        const saveBtn = actionsRow.createEl("button", { text: "保存 / Save" });
        saveBtn.style.cssText = "padding:4px 16px;border-radius:4px;cursor:pointer;font-size:0.85em;background:var(--interactive-accent);color:var(--text-on-accent);border:none;font-weight:600;";
        saveBtn.onclick = async () => {
          tpl.prompt = promptTA.value;
          await this.plugin.saveSettings();
          new Notice(`模板已保存：${tpl.name}`);
        };

        // Rename
        const renameBtn = actionsRow.createEl("button", { text: "重命名 / Rename" });
        renameBtn.style.cssText = "padding:4px 14px;border-radius:4px;cursor:pointer;font-size:0.85em;background:var(--background-secondary);border:1px solid var(--background-modifier-border);color:var(--text-normal);";
        renameBtn.onclick = async () => {
          const newName = prompt("新名称 / New name:", tpl.name);
          if (newName?.trim()) {
            tpl.name = newName.trim();
            await this.plugin.saveSettings();
            renderTabs();
          }
        };

        // Reset (built-in only)
        if (tpl.builtin) {
          const resetBtn = actionsRow.createEl("button", { text: "重置默认 / Reset" });
          resetBtn.style.cssText = "padding:4px 14px;border-radius:4px;cursor:pointer;font-size:0.85em;background:var(--background-secondary);border:1px solid var(--background-modifier-border);color:var(--text-muted);";
          resetBtn.onclick = async () => {
            const def = DEFAULT_PROMPT_LIBRARY.find(d => d.id === tpl.id);
            if (def) {
              tpl.prompt = def.prompt;
              promptTA.value = tpl.prompt;
              await this.plugin.saveSettings();
              new Notice("已重置为默认 / Reset to default.");
            }
          };
        }

        // Delete (custom only, keep at least 1)
        if (!tpl.builtin && lib.length > 1) {
          const delBtn = actionsRow.createEl("button", { text: "删除 / Delete" });
          delBtn.style.cssText = "padding:4px 14px;border-radius:4px;cursor:pointer;font-size:0.85em;background:var(--background-secondary);border:1px solid var(--text-error,#cc4444);color:var(--text-error,#cc4444);";
          delBtn.onclick = async () => {
            const idx = lib.findIndex(t => t.id === selectedId);
            lib.splice(idx, 1);
            selectedId = lib[Math.max(0, idx - 1)].id;
            this.plugin.settings.activePromptId = selectedId;
            promptTA.value = lib.find(t => t.id === selectedId)!.prompt;
            await this.plugin.saveSettings();
            renderTabs();
            renderActions();
          };
        }
      };

      // Initialize
      const initTpl = this.plugin.settings.promptLibrary!.find(t => t.id === selectedId) ?? this.plugin.settings.promptLibrary![0];
      promptTA.value = initTpl.prompt;
      renderTabs();
      renderActions();
    }

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
      .setName("立即运行每日报告 / Run Daily Report Now")
      .setDesc("完整流程：抓取 + AI 摘要 + 写入 inbox/（请先确认 API Key 和配置正确）| Full pipeline: fetch + AI digest + write to inbox/. Verify your API key first.")
      .addButton(btn => {
        btn.setButtonText("▶ 立即运行 / Run Daily Now")
          .setCta()
          .onClick(async () => {
            btn.setButtonText("Running...").setDisabled(true);
            setStatus("启动中...");
            try {
              await this.plugin.runDaily((msg) => setStatus(msg));
              setStatus("✓ 完成！请查看 PaperDaily/inbox/ 中今天的文件 / Done! Check PaperDaily/inbox/ for today's file.", "var(--color-green)");
            } catch (err) {
              setStatus(`✗ Error: ${String(err)}`, "var(--color-red)");
            } finally {
              btn.setButtonText("▶ 立即运行 / Run Daily Now").setDisabled(false);
            }
          });
      });

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

    // ── Deep Read ────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "全文精读 / Deep Read" });

    const drSubContainer = containerEl.createDiv();
    const refreshDrSub = () => {
      drSubContainer.style.display = this.plugin.settings.deepRead?.enabled ? "" : "none";
    };

    new Setting(containerEl)
      .setName("开启精读 / Enable Deep Read")
      .setDesc("抓取排名最高的 N 篇论文的全文（arxiv.org/html），注入 LLM prompt，让模型做更深度的逐篇分析 | Fetch full paper text and inject into the digest prompt for richer per-paper analysis")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.deepRead?.enabled ?? false)
        .onChange(async (value) => {
          this.plugin.settings.deepRead = { ...this.plugin.settings.deepRead, enabled: value } as typeof this.plugin.settings.deepRead;
          await this.plugin.saveSettings();
          refreshDrSub();
        }));

    new Setting(drSubContainer)
      .setName("精读篇数 / Papers to fetch")
      .setDesc("每日抓取全文的最高分论文篇数（建议 3–5，越多 prompt 越长）| Number of top papers to fetch full text for")
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.deepRead?.topN ?? 5)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.deepRead = { ...this.plugin.settings.deepRead, topN: value } as typeof this.plugin.settings.deepRead;
          await this.plugin.saveSettings();
        }));

    // --- Max tokens slider ---
    new Setting(drSubContainer)
      .setName("每篇分析 Token 上限 / Max tokens per paper")
      .setDesc("Deep Read 每篇论文 LLM 调用的输出 token 上限（默认 1024，建议 512–2048）")
      .addSlider(slider => slider
        .setLimits(256, 4096, 128)
        .setValue(this.plugin.settings.deepRead?.deepReadMaxTokens ?? 1024)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.deepRead = {
            ...this.plugin.settings.deepRead, deepReadMaxTokens: value
          } as typeof this.plugin.settings.deepRead;
          await this.plugin.saveSettings();
        }));

    // --- Per-paper prompt textarea ---
    new Setting(drSubContainer)
      .setName("每篇精读 Prompt / Per-paper Deep Read prompt")
      .setDesc(
        "留空使用默认模板。可用变量: {{title}}, {{authors}}, {{directions}}, " +
        "{{interest_hits}}, {{abstract}}, {{fulltext}}, {{language}}"
      )
      .addTextArea(area => {
        const plugin = this.plugin;
        area.setPlaceholder("(leave blank for default)");
        area.setValue(plugin.settings.deepRead?.deepReadPromptTemplate ?? "");
        area.inputEl.rows = 8;
        area.inputEl.style.width = "100%";
        area.inputEl.style.fontFamily = "monospace";
        area.inputEl.style.fontSize = "0.85em";
        area.inputEl.addEventListener("input", async () => {
          const val = area.inputEl.value.trim();
          plugin.settings.deepRead = {
            ...plugin.settings.deepRead,
            deepReadPromptTemplate: val || undefined
          } as typeof plugin.settings.deepRead;
          await plugin.saveSettings();
        });
      });

    refreshDrSub();

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
