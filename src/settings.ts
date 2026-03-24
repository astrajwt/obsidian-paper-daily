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

export const DEFAULT_DAILY_PROMPT = `You are a senior AI/ML research analyst and critical peer reviewer. You combine deep engineering insight with academic rigor. Be direct and opinionated.

Today: {{date}}
Output language: {{language}}

---

## User's interest keywords (with weights, higher = more important):
{{interest_keywords}}

## Papers to analyze (pre-ranked, arXiv + HuggingFace combined):
{{papers_json}}

{{hf_data_section}}

{{fulltext_section}}

---

## Instructions

Generate the daily digest with the following sections:

### 今日要点 / Key Takeaways
3–5 punchy bullet points. What actually moved the needle today vs what is incremental noise? Be direct.

### 精选论文 / Curated Papers
For **each paper** in the papers list, output exactly this structure:

**[N]. {title}**
- ⭐ 价值评级: {★★★★★ to ★☆☆☆☆}  ({one-phrase reason})
- 关键词: {interest hits}
- 🤗 HF 热度: {hfUpvotes} 赞  ← **only include this line if hfUpvotes > 0 for this paper; omit entirely otherwise**
- 💡 核心贡献: one sentence — what exactly did they do / prove / build? Be specific with method names and key numbers.
- 🔬 方法核心: key technical novelty — principled or ad hoc? any theoretical guarantees or assumptions worth noting?
  > If a Deep Read note exists for this paper (see fulltext_section above), draw directly from it here and in 工程启示 / 局限性. Prefer that analysis over the abstract.
- 📊 实验严谨性: are baselines fair and up-to-date? ablations sufficient? any obvious cherry-picking or missing controls?
- 🔧 工程启示: what can a practitioner adopt? Be concrete — "use X to achieve Y", not "this is interesting".
- ⚠️ 局限性 & 可复现性: scope limitations + code availability + compute requirements. Can a grad student replicate this?
- 📚 建议: {Skip | Read abstract | Skim methods | Read in full | Implement & test}
- 🔗 links from the paper data (arXiv / HF / PDF as available)

Value rating guide — be calibrated, not generous:
★★★★★  Breakthrough: likely to shift practice or become a citation anchor
★★★★☆  Strong: clear improvement, solid evaluation, worth reading in full
★★★☆☆  Solid: incremental but honest; good for domain awareness
★★☆☆☆  Weak: narrow scope, questionable baselines, or limited novelty
★☆☆☆☆  Skip: below standard, off-topic, or superseded

{{hf_signal_section}}

### 今日批次质量 & 结语 / Batch Quality & Closing
2–3 sentences: Is today a high-signal or low-signal day? What's the overall quality distribution? The single most important thing to keep an eye on from today's batch.

---
Rules:
- Do NOT hedge every sentence. State your assessment directly.
- Call out benchmark overfitting, p-hacking, insufficient baselines, or vague claims explicitly.
- If hfUpvotes is high but interest keyword relevance is low, note the discrepancy.
- If a paper seems overhyped relative to its technical content, say so.
- Keep engineering perspective front and center.
- 工程启示 must be actionable — not "this is interesting" but "you can use X to achieve Y in your system".
- Recommendations must be specific — no "interesting direction" hedging.
- If fulltext_section is non-empty, you MUST use those deep-read notes to enrich the analysis of the corresponding papers. Do not ignore them.
- HuggingFace papers in papers_json must receive the same full analysis treatment as arXiv papers.`;

export const DEFAULT_SCORING_PROMPT = `Score each paper 1–10 for quality and relevance to the user's interests.

User's interest keywords (higher weight = more important): {{interest_keywords}}

Scoring criteria:
- Alignment with interest keywords and their weights
- Technical novelty and depth
- Practical engineering value
- Quality of evaluation / experiments

Return ONLY a valid JSON array, no explanation, no markdown fence:
[{"id":"arxiv:...","score":8,"reason":"one short phrase","summary":"1–2 sentence plain-language summary"},...]

Papers:
{{papers_json}}`;

export const DEFAULT_DEEP_READ_PROMPT = `You are a senior AI/ML research analyst. Write a self-contained deep-read note for this paper — it will be saved as a standalone Markdown reference document.

**Paper:**
Title: {{title}}
Authors: {{authors}}
Published: {{published}}
arXiv: {{arxiv_url}}
Keyword hits: {{interest_hits}}

**Abstract:**
{{abstract}}

**Full paper** (read directly if the URL is accessible): {{fulltext}}

---

Write the note with the following Markdown sections. Be direct, opinionated, and technically precise. No filler phrases.

## TL;DR
One sentence: what they built/proved + the single most important result number.

## 核心贡献 / Core Contribution
2–3 sentences. What exactly is new? Method name, dataset, metric, key numbers.

## 方法 / Method
3–5 bullet points. Key technical decisions and why they matter. What distinguishes this from prior work at the mechanism level?

## 实验结果 / Results
- Which benchmarks / tasks
- Headline numbers vs strongest baseline (exact figures)
- Key ablation finding (if any)
- What is suspiciously missing or underreported?

## 工程启示 / Engineering Takeaway
1–2 sentences. What can a practitioner directly adopt? "Use X to achieve Y" — not "this is interesting".

## 局限性 / Limitations
1–2 sentences. Scope, compute requirements, reproducibility, failure modes in production.

## 相关工作 / Related Work
2–3 papers this most directly builds on or competes with. One line each: title + why it's relevant.

---
Output language: {{language}}
Aim for 400–600 words total. Do not copy the abstract verbatim — synthesize.`;

export const DEFAULT_PROMPT_LIBRARY: PromptTemplate[] = [
  { id: "builtin_engineering", name: "每日trending", type: "daily", prompt: DEFAULT_DAILY_PROMPT, builtin: true },
  { id: "builtin_scoring", name: "批量评分", type: "scoring", prompt: DEFAULT_SCORING_PROMPT, builtin: true },
  { id: "builtin_deepread", name: "全文精读", type: "deepread", prompt: DEFAULT_DEEP_READ_PROMPT, builtin: true },
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
  fetchMode: "all",
  dedup: true,
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

  deepRead: {
    enabled: false,
    topN: 10,
    deepReadMaxTokens: 2048,
    outputFolder: "PaperDaily/deep-read",
    tags: ["paper", "deep-read"],
    // deepReadPromptTemplate intentionally omitted → pipeline falls back to DEFAULT_DEEP_READ_PROMPT
  },

  promptLibrary: DEFAULT_PROMPT_LIBRARY.map(t => ({ ...t })),
  activePromptId: "builtin_engineering",
  activeScorePromptId: "builtin_scoring",
  activeDeepReadPromptId: "builtin_deepread",
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
      .setName("拉取方式 / Fetch Mode")
      .setDesc(
        "全量拉取：抓取分类下所有论文（由 LLM 打分后排序展示）\n" +
        "仅兴趣关键词：只保留命中至少一个兴趣关键词的论文，适合关键词覆盖全面时使用。\n\n" +
        "Fetch all: retrieve all papers in the selected categories and let LLM scoring determine relevance.\n" +
        "Interest only: keep only papers matching at least one interest keyword — best when your keyword list is comprehensive."
      )
      .addDropdown(drop => drop
        .addOption("all", "全量拉取 / Fetch All")
        .addOption("interest_only", "仅兴趣关键词 / Interest Only")
        .setValue(this.plugin.settings.fetchMode ?? "all")
        .onChange(async (value) => {
          this.plugin.settings.fetchMode = value as "all" | "interest_only";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("去重 / Dedup")
      .setDesc("跳过已在往期日报中出现过的论文，避免重复展示。关闭后每次运行都会重新处理全部拉取结果 | Skip papers already shown in a previous daily report. Disable to reprocess all fetched papers every run.")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.dedup ?? true)
        .onChange(async (value) => {
          this.plugin.settings.dedup = value;
          await this.plugin.saveSettings();
        }))
      .addButton(btn => btn
        .setButtonText("清空缓存 / Clear")
        .setWarning()
        .onClick(async () => {
          await this.plugin.clearDedup();
          new Notice("去重缓存已清空 / Dedup cache cleared.");
        }));

    new Setting(containerEl)
      .setName("HuggingFace 论文源 / HuggingFace Source")
      .setDesc("开启后抓取 huggingface.co/papers 每日精选，与 arXiv 结果合并排名 | Fetch HuggingFace daily papers and merge with arXiv results")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.hfSource?.enabled !== false)
        .onChange(async (value) => {
          this.plugin.settings.hfSource = { ...this.plugin.settings.hfSource, enabled: value };
          await this.plugin.saveSettings();
          this.display();
        }));

    if (this.plugin.settings.hfSource?.enabled !== false) {
      new Setting(containerEl)
        .setName("HuggingFace 回溯天数 / HuggingFace Lookback Days")
        .setDesc("huggingface.co/papers 无当日数据时（如周末），往前查找最近 N 天的精选 | If today has no HuggingFace papers (e.g. weekend), look back up to N days")
        .addSlider(slider => slider
          .setLimits(0, 7, 1)
          .setValue(this.plugin.settings.hfSource?.lookbackDays ?? 3)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.hfSource = { ...this.plugin.settings.hfSource, lookbackDays: value };
            await this.plugin.saveSettings();
          }));
    }

    new Setting(containerEl)
      .setName("时间窗口（小时）/ Time Window (hours)")
      .setDesc("抓取过去 N 小时内发布或更新的论文，默认 72 小时覆盖周末 | Fetch papers published/updated within the past N hours. Default 72 covers weekends.")
      .addSlider(slider => slider
        .setLimits(24, 168, 24)
        .setValue(this.plugin.settings.timeWindowHours ?? 72)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.timeWindowHours = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("RSS 订阅源 / RSS Sources")
      .setDesc("🚧 Coming Soon — 自定义 RSS/Atom 订阅源将在后续版本支持 | Custom RSS/Atom feed ingestion is planned for a future release.");

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

    // ── Prompt Templates (tabbed library) ────────────────────────
    containerEl.createEl("h2", { text: "Prompt 模板库 / Prompt Library" });
    {
      const TYPE_LABELS: Record<string, string> = { daily: "日报", scoring: "评分", deepread: "精读" };
      const TYPE_COLORS: Record<string, string> = { daily: "#4a90d9", scoring: "#5cb85c", deepread: "#9b59b6" };

      const desc = containerEl.createEl("div", { cls: "setting-item-description" });
      desc.createEl("p", { text: "点击 Tab 可切换模板并将其设为对应功能的激活模板。" });
      const table = desc.createEl("table");
      table.style.fontSize = "11px";
      table.style.borderCollapse = "collapse";
      table.style.width = "100%";
      const rows: [string, string][] = [
        ["[日报] {{date}}", "当日日期 YYYY-MM-DD"],
        ["[日报] {{papers_json}}", "排名后论文列表 JSON（最多 20 篇，含 arXiv + HF）"],
        ["[日报] {{hf_data_section}}", "HF 数据块（HF 开启时含标题+JSON，关闭时为空）"],
        ["[日报] {{hf_signal_section}}", "HF 社区信号指令块（HF 开启时注入，关闭时为空）"],
        ["[日报] {{fulltext_section}}", "Deep Read 精读结果（Markdown）"],
        ["[日报] {{interest_keywords}}", "兴趣关键词及权重"],
        ["[日报] {{language}}", "Chinese (中文) 或 English"],
        ["[评分] {{interest_keywords}}", "兴趣关键词及权重"],
        ["[评分] {{papers_json}}", "本批论文 JSON（含 id/title/abstract/interestHits/hfUpvotes）"],
        ["[精读] {{title}} {{authors}}", "论文标题 / 前 5 位作者"],
        ["[精读] {{published}} {{arxiv_url}}", "发布日期 / arXiv 链接"],
        ["[精读] {{interest_hits}}", "命中的兴趣关键词"],
        ["[精读] {{abstract}}", "摘要全文"],
        ["[精读] {{fulltext}}", "arxiv.org/html URL（让模型直接读）"],
        ["[精读] {{language}}", "Chinese (中文) 或 English"],
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

      // ── Migrate: ensure all builtins present and new active IDs set ──
      if (!this.plugin.settings.promptLibrary || this.plugin.settings.promptLibrary.length === 0) {
        this.plugin.settings.promptLibrary = DEFAULT_PROMPT_LIBRARY.map(t => ({ ...t }));
        this.plugin.settings.activePromptId = "builtin_engineering";
        this.plugin.settings.activeScorePromptId = "builtin_scoring";
        this.plugin.settings.activeDeepReadPromptId = "builtin_deepread";
      }
      const lib = this.plugin.settings.promptLibrary!;
      for (const def of DEFAULT_PROMPT_LIBRARY) {
        if (!lib.find(t => t.id === def.id)) lib.push({ ...def });
      }
      // Ensure type field on existing builtins
      for (const def of DEFAULT_PROMPT_LIBRARY) {
        const existing = lib.find(t => t.id === def.id);
        if (existing && !existing.type) existing.type = def.type;
      }
      if (!this.plugin.settings.activePromptId) this.plugin.settings.activePromptId = "builtin_engineering";
      if (!this.plugin.settings.activeScorePromptId) this.plugin.settings.activeScorePromptId = "builtin_scoring";
      if (!this.plugin.settings.activeDeepReadPromptId) this.plugin.settings.activeDeepReadPromptId = "builtin_deepread";

      const getActiveIdForType = (type: string) => {
        if (type === "scoring") return this.plugin.settings.activeScorePromptId;
        if (type === "deepread") return this.plugin.settings.activeDeepReadPromptId;
        return this.plugin.settings.activePromptId;
      };
      const setActiveIdForType = async (type: string, id: string) => {
        if (type === "scoring") this.plugin.settings.activeScorePromptId = id;
        else if (type === "deepread") this.plugin.settings.activeDeepReadPromptId = id;
        else this.plugin.settings.activePromptId = id;
        await this.plugin.saveSettings();
      };

      let selectedId = this.plugin.settings.activePromptId!;

      const tabBar = containerEl.createDiv();
      tabBar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;align-items:center;";

      const promptTA = containerEl.createEl("textarea");
      promptTA.style.cssText = "width:100%;height:300px;font-family:monospace;font-size:11px;padding:8px;resize:vertical;box-sizing:border-box;";

      const actionsRow = containerEl.createDiv();
      actionsRow.style.cssText = "display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center;";

      const renderTabs = () => {
        tabBar.empty();
        for (const tpl of lib) {
          const tplType = tpl.type ?? "daily";
          const activeIdForType = getActiveIdForType(tplType);
          const isSelected = tpl.id === selectedId;
          const isActiveForType = tpl.id === activeIdForType;
          const typeColor = TYPE_COLORS[tplType] ?? "#888";
          const typeLabel = TYPE_LABELS[tplType] ?? tplType;

          const btn = tabBar.createEl("button");
          // Badge span
          const badge = btn.createEl("span", { text: typeLabel });
          badge.style.cssText = `display:inline-block;font-size:0.75em;padding:1px 5px;border-radius:3px;margin-right:5px;background:${typeColor};color:#fff;font-weight:600;vertical-align:middle;`;
          btn.appendText(tpl.name);
          if (isActiveForType) {
            const dot = btn.createEl("span", { text: " ✓" });
            dot.style.cssText = `color:${typeColor};font-weight:700;`;
          }
          const accent = "var(--interactive-accent)";
          const border = "var(--background-modifier-border)";
          btn.style.cssText = [
            "padding:5px 12px",
            "border-radius:5px",
            "cursor:pointer",
            "font-size:0.85em",
            `border:2px solid ${isSelected ? accent : border}`,
            `background:${isSelected ? accent : "var(--background-secondary)"}`,
            `color:${isSelected ? "var(--text-on-accent)" : "var(--text-normal)"}`,
            "font-weight:" + (isSelected ? "600" : "400"),
            "transition:all 0.1s",
          ].join(";");
          btn.onclick = async () => {
            selectedId = tpl.id;
            await setActiveIdForType(tplType, tpl.id);
            promptTA.value = tpl.prompt;
            renderTabs();
            renderActions();
          };
        }
        // Add new template: type selector + button
        const typeSelect = tabBar.createEl("select");
        typeSelect.style.cssText = "padding:4px 8px;border-radius:5px;font-size:0.85em;border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-normal);cursor:pointer;";
        ([["daily", "日报"], ["scoring", "评分"], ["deepread", "精读"]] as [string, string][]).forEach(([val, label]) => {
          const o = typeSelect.createEl("option", { text: label });
          o.value = val;
        });

        const addBtn = tabBar.createEl("button", { text: "＋ 新建" });
        addBtn.style.cssText = "padding:5px 12px;border-radius:5px;cursor:pointer;font-size:0.85em;border:2px dashed var(--background-modifier-border);background:transparent;color:var(--text-muted);";
        addBtn.onclick = async () => {
          const newType = typeSelect.value as "daily" | "scoring" | "deepread";
          const defaultPrompt = newType === "scoring" ? DEFAULT_SCORING_PROMPT
            : newType === "deepread" ? DEFAULT_DEEP_READ_PROMPT
            : DEFAULT_DAILY_PROMPT;
          const newTpl: PromptTemplate = {
            id: `custom_${Date.now()}`,
            name: `自定义 ${lib.filter(t => !t.builtin).length + 1}`,
            type: newType,
            prompt: defaultPrompt,
          };
          lib.push(newTpl);
          selectedId = newTpl.id;
          await setActiveIdForType(newType, newTpl.id);
          await this.plugin.saveSettings();
          promptTA.value = newTpl.prompt;
          renderTabs();
          renderActions();
        };
      };

      const renderActions = () => {
        actionsRow.empty();
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
            const prevTpl = lib.find(t => t.id === selectedId)!;
            await setActiveIdForType(prevTpl.type ?? "daily", selectedId);
            promptTA.value = prevTpl.prompt;
            await this.plugin.saveSettings();
            renderTabs();
            renderActions();
          };
        }
      };

      // Initialize
      const initTpl = lib.find(t => t.id === selectedId) ?? lib[0];
      promptTA.value = initTpl.prompt;
      renderTabs();
      renderActions();
    }

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
      .setDesc("每日精读的最高分论文篇数（1–999）| Number of top papers to deep-read per day (1–999, default 10)")
      .addText(text => text
        .setPlaceholder("10")
        .setValue(String(this.plugin.settings.deepRead?.topN ?? 10))
        .onChange(async (value) => {
          const n = parseInt(value, 10);
          if (!isNaN(n) && n >= 1 && n <= 999) {
            this.plugin.settings.deepRead = { ...this.plugin.settings.deepRead, topN: n } as typeof this.plugin.settings.deepRead;
            await this.plugin.saveSettings();
          }
        }));

    // --- Max tokens text input ---
    new Setting(drSubContainer)
      .setName("每篇分析 Token 上限 / Max tokens per paper")
      .setDesc("Deep Read 每篇论文 LLM 调用的输出 token 上限，按模型上限填写（如 8192）| Max output tokens per paper deep-read call — set to your model's limit")
      .addText(text => text
        .setPlaceholder("2048")
        .setValue(String(this.plugin.settings.deepRead?.deepReadMaxTokens ?? 2048))
        .onChange(async (value) => {
          const n = parseInt(value, 10);
          if (!isNaN(n) && n > 0) {
            this.plugin.settings.deepRead = {
              ...this.plugin.settings.deepRead, deepReadMaxTokens: n
            } as typeof this.plugin.settings.deepRead;
            await this.plugin.saveSettings();
          }
        }));

    // --- Output folder ---
    new Setting(drSubContainer)
      .setName("输出目录 / Output Folder")
      .setDesc("精读笔记保存目录（Vault 内路径）| Vault folder path for per-paper deep-read notes")
      .addText(text => text
        .setPlaceholder("PaperDaily/deep-read")
        .setValue(this.plugin.settings.deepRead?.outputFolder ?? "PaperDaily/deep-read")
        .onChange(async (value) => {
          this.plugin.settings.deepRead = {
            ...this.plugin.settings.deepRead,
            outputFolder: value.trim() || "PaperDaily/deep-read"
          } as typeof this.plugin.settings.deepRead;
          await this.plugin.saveSettings();
        }));

    // --- Tags ---
    new Setting(drSubContainer)
      .setName("标签 / Tags")
      .setDesc("逗号分隔，写入每篇精读笔记的 frontmatter tags | Comma-separated tags added to each paper note's frontmatter")
      .addText(text => text
        .setPlaceholder("paper, deep-read")
        .setValue((this.plugin.settings.deepRead?.tags ?? ["paper", "deep-read"]).join(", "))
        .onChange(async (value) => {
          const tags = value.split(",").map((s: string) => s.trim()).filter(Boolean);
          this.plugin.settings.deepRead = {
            ...this.plugin.settings.deepRead,
            tags
          } as typeof this.plugin.settings.deepRead;
          await this.plugin.saveSettings();
        }));

    // --- File name template ---
    new Setting(drSubContainer)
      .setName("文件名模板 / File Name Template")
      .setDesc("精读笔记的文件名（不含 .md）。可用变量：{{title}} {{arxivId}} {{date}} {{model}} {{year}} {{month}} {{day}} | File name (without .md). Variables: {{title}} {{arxivId}} {{date}} {{model}} {{year}} {{month}} {{day}}")
      .addText(text => text
        .setPlaceholder("{{title}}-deep-read-{{model}}")
        .setValue(this.plugin.settings.deepRead?.fileNameTemplate ?? "")
        .onChange(async (value) => {
          this.plugin.settings.deepRead = {
            ...this.plugin.settings.deepRead,
            fileNameTemplate: value.trim()
          } as typeof this.plugin.settings.deepRead;
          await this.plugin.saveSettings();
        }));

    refreshDrSub();

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
      .setDesc("模型单次响应的最大 token 数，按模型上限填写（如 DeepSeek-R1 填 64000）| Maximum output tokens — set to your model's limit (e.g. 64000 for DeepSeek-R1)")
      .addText(text => text
        .setPlaceholder("4096")
        .setValue(String(this.plugin.settings.llm.maxTokens))
        .onChange(async (value) => {
          const n = parseInt(value, 10);
          if (!isNaN(n) && n > 0) {
            this.plugin.settings.llm.maxTokens = n;
            await this.plugin.saveSettings();
          }
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


    // ── Tools ─────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "工具 / Tools" });

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
          .onClick(() => {
            this.plugin.runDailyWithUI();
          });
      });

    // ── Backfill ──────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "批量生成日报 / Batch Generate Daily Reports" });
    containerEl.createEl("p", {
      text: "按日期范围批量生成每日报告，适合补全历史记录 | Generate daily reports for a date range to backfill historical records.",
      cls: "setting-item-description"
    });

    let bfStartDate = "";
    let bfEndDate = "";

    new Setting(containerEl)
      .setName("开始日期 / Start Date")
      .setDesc("YYYY-MM-DD")
      .addText(text => text
        .setPlaceholder("2026-02-01")
        .onChange(v => { bfStartDate = v.trim(); }));

    new Setting(containerEl)
      .setName("结束日期 / End Date")
      .setDesc("YYYY-MM-DD")
      .addText(text => text
        .setPlaceholder("2026-02-28")
        .onChange(v => { bfEndDate = v.trim(); }));

    new Setting(containerEl)
      .addButton(btn => btn
        .setButtonText("▶ 批量生成 / Run Batch")
        .setCta()
        .onClick(() => {
          if (!bfStartDate || !bfEndDate) {
            setStatus("请填写开始和结束日期。", "var(--color-red)");
            return;
          }
          this.plugin.runBackfillWithUI(bfStartDate, bfEndDate);
        }));

    // ── Config File ───────────────────────────────────────────────
    containerEl.createEl("h2", { text: "配置文件 / Config File" });

    const configPath = `${this.plugin.settings.rootFolder}/config.json`;
    new Setting(containerEl)
      .setName("配置文件路径 / Config File Path")
      .setDesc(`所有设置自动同步到此 Vault 文件，换设备或重装插件时将优先从此文件读取。| All settings are auto-synced to this vault file and loaded on startup.`)
      .addText(text => {
        text.setValue(configPath);
        text.inputEl.readOnly = true;
        text.inputEl.style.width = "100%";
        text.inputEl.style.color = "var(--text-muted)";
        text.inputEl.style.fontFamily = "monospace";
        text.inputEl.style.fontSize = "0.85em";
      });

    new Setting(containerEl)
      .addButton(btn => btn
        .setButtonText("立即导出 / Export Now")
        .setCta()
        .onClick(async () => {
          await this.plugin.saveSettings();
          new Notice(`配置已导出到 ${configPath}`);
        }))
      .addButton(btn => btn
        .setButtonText("从文件重载 / Reload from File")
        .onClick(async () => {
          await this.plugin.loadSettings();
          new Notice("已从配置文件重新加载设置。");
          this.display();
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
