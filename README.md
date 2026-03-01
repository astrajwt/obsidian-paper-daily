# Paper Daily

> Obsidian plugin — Daily arXiv + HuggingFace paper digest with AI summarization, direction scoring, deep read, and automated reports.

[中文](#中文说明) | [English](#english)

---

## 中文说明

### 简介

Paper Daily 是一个 Obsidian 插件，每天自动从 **arXiv** 和 **HuggingFace Daily Papers** 拉取你关注领域的最新论文，通过 AI 生成结构化每日摘要，并按研究方向（RLHF、Agentic RL、Inference Serving、MoE 等）自动分类打分。支持多套 Prompt 模板、全文精读注入、PDF 下载，以及历史日期回补。

**适合人群**：AI/ML 研究者、工程师，希望在 Obsidian 笔记库中持续追踪 arXiv + HF 最新进展。

---

### 核心功能

| 功能 | 说明 |
|------|------|
| 每日拉取 | arXiv 按分类 + 关键词检索，过滤过去 N 小时内的新论文，自动去重 |
| HuggingFace 源 | 抓取 HF 每日精选，HF 点赞数作为排名首要信号 |
| AI 摘要 | 调用 LLM 生成结构化要点，标注研究方向、关键词命中 |
| Prompt 模板库 | 内置三套模板（工程精读 / 速览 / 技术评审），支持自定义和多套并存 |
| 方向打分 | 可配置研究方向（关键词 + 权重），每篇论文自动归类并排序 |
| 兴趣关键词 | 配置你最关注的词（支持权重），摘要中突出显示命中情况 |
| 全文精读 | 抓取排名最高论文的 HTML 全文，注入 LLM prompt，获得更深度分析 |
| PDF 下载 | 自动下载论文 PDF 并存入 Vault |
| 历史回补 | 指定日期范围，补充生成历史每日摘要 |
| 容灾保障 | 网络或 LLM 报错时仍然落盘文件（含错误说明），产物不断档 |

---

### 输出文件结构

```
PaperDaily/
  inbox/
    2026-02-28.md         ← 每日摘要
  papers/
    2026-02-28.json       ← 原始论文数据快照
  cache/
    state.json            ← 运行状态
    seen_ids.json         ← 去重记录
    runs.log              ← 运行日志
    fulltext/             ← 全文精读缓存（启用时）
  papers/
    pdf/                  ← PDF 文件（启用时）
```

---

### 安装

#### 方法一：直接复制文件（推荐）

1. 前往本仓库 [Releases](../../releases) 页面，下载最新版本的三个文件：
   - `main.js`
   - `manifest.json`
   - `styles.css`（如有）

2. 在你的 Obsidian Vault 中创建插件目录（如不存在）：
   ```
   <你的 Vault>/.obsidian/plugins/paper-daily/
   ```

3. 将上述三个文件复制到该目录下：
   ```
   .obsidian/plugins/paper-daily/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```

4. 打开 Obsidian → 设置 → 第三方插件，关闭「安全模式」，然后启用 **Paper Daily**。

> **macOS 路径示例**：`~/Documents/MyVault/.obsidian/plugins/paper-daily/`
> **Windows 路径示例**：`C:\Users\你的用户名\Documents\MyVault\.obsidian\plugins\paper-daily\`

#### 方法二：开发者本地构建

```bash
git clone https://github.com/your-username/paper-daily.git
cd paper-daily
npm install
npm run build
```

将构建产物（`main.js` + `manifest.json`）复制到 Vault 插件目录，或使用符号链接：

```bash
ln -s $(pwd) ~/path/to/your/vault/.obsidian/plugins/paper-daily
```

---

### 快速开始

1. 安装并启用插件后，打开 **设置 → Paper Daily**
2. 填入你的 **LLM API Key**，选择服务商（DeepSeek / OpenAI / Claude 等）
3. 确认 **arXiv 分类**（默认 `cs.AI, cs.LG, cs.CL`）
4. 按 `Ctrl+P` 打开命令面板，执行 `Paper Daily: Run daily fetch & summarize now`
5. 生成的摘要位于 `PaperDaily/inbox/YYYY-MM-DD.md`

---

### 配置说明

打开 Obsidian 设置 → Paper Daily：

#### arXiv 拉取

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| Categories | `cs.AI,cs.LG,cs.CL` | arXiv 分类，逗号分隔 |
| Keywords | 空 | 查询关键词，与分类 AND 组合；留空则只按分类查询 |
| Interest Keywords | 空 | 你最关注的词（格式 `keyword:weight`），用于排序和高亮 |
| Max Results Per Day | 20 | 每日摘要最多展示的论文数 |
| Time Window | 72h | 拉取过去 N 小时内的论文 |
| Sort By | submittedDate | 按提交日期或最后更新日期排序 |

#### HuggingFace 源

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| Enable HF Source | 开启 | 抓取 HF 每日精选，点赞数合并到排名中 |
| Lookback Days | 3 | 今日无数据时（如周末）向前查找的天数 |
| Dedup HF Papers | 关闭 | 跳过已在历史摘要中出现过的 HF 精选 |

#### 研究方向

内置 20 个方向，均可在设置中通过 JSON 自定义权重和关键词：

| 方向 | 示例关键词 |
|------|------------|
| RLHF & Post-training | rlhf, ppo, dpo, grpo, reward model |
| Agentic RL & Tool Use | agent, tool use, function calling, react |
| Inference Serving | kv cache, pagedattention, speculative, vllm |
| Training Systems | fsdp, zero, deepspeed, megatron |
| MoE Systems | moe, mixture of experts, routing |
| Long Context & Attention | flash attention, rope, sliding window |
| Quantization & Compression | quantization, awq, gptq, distillation, lora |
| Retrieval & RAG | rag, dense retrieval, vector db, reranker |
| … | （共 20 个方向，详见设置页）|

#### LLM 配置

支持的服务商（设置页一键切换）：

| 服务商 | 类型 | 说明 |
|--------|------|------|
| DeepSeek | OpenAI Compatible | 推荐，性价比高 |
| OpenAI | OpenAI Compatible | GPT-4o / GPT-4o-mini |
| Claude | Anthropic | claude-3-5-sonnet / claude-opus-4 |
| Qwen / 通义 | OpenAI Compatible | 阿里云 DashScope |
| GLM / 智谱 | OpenAI Compatible | — |
| Moonshot / Kimi | OpenAI Compatible | — |
| MiniMax | OpenAI Compatible | — |
| Custom | OpenAI Compatible | 任意 OpenAI 格式接口 |

#### Prompt 模板库

内置三套模板，可在设置页 Tab 切换：

| 模板 | 风格 |
|------|------|
| 工程精读 | 完整结构，含价值评级、工程启示、局限性 |
| 速览 | 精简，每篇一行，适合快速浏览 |
| 技术评审 | 学术视角，评估方法严谨性和实验可信度 |

支持新建自定义模板；占位符：`{{date}}` `{{topDirections}}` `{{papers_json}}` `{{hf_papers_json}}` `{{fulltext_section}}` `{{language}}`

#### 全文精读 / Deep Read

启用后，插件会抓取排名最高 N 篇论文的 HTML 全文（`arxiv.org/html`），注入 LLM prompt：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| Enable Deep Read | 关闭 | 开启后精读功能激活 |
| Papers to Fetch | 5 | 每日抓取全文的篇数（建议 3–5） |
| Max Chars Per Paper | 8000 | 全文截断长度 |
| Cache TTL | 60 天 | 全文缓存保留天数 |

---

### 命令

在命令面板（`Ctrl+P`）搜索 `Paper Daily`：

| 命令 | 说明 |
|------|------|
| `Run daily fetch & summarize now` | 立即拉取今日论文并生成摘要 |
| `Backfill daily summaries for date range` | 回补指定日期范围的每日摘要 |
| `Rebuild index from local cache` | 从本地缓存重建去重索引 |
| `Open settings` | 打开插件设置页 |

---

### 每日摘要示例

```markdown
---
type: paper-daily
date: 2026-02-28
sources: [arxiv, huggingface]
categories: [cs.AI, cs.LG, cs.CL]
---

# Paper Daily — 2026-02-28

## Top Directions Today
- **RLHF & Post-training** (score: 12.4, 3 papers)
- **Agentic RL & Tool Use** (score: 8.7, 2 papers)
- **Inference Serving** (score: 6.2, 2 papers)

## 今日要点 / Key Takeaways
- ...

## 精选论文 / Curated Papers
**1. Some Paper Title**
- ⭐ 价值评级: ★★★★☆  (solid improvement on speculative decoding)
- 🧭 方向: Inference Serving  |  关键词: kv cache, speculative
- 💡 核心贡献: ...
- 🔧 工程启示: ...
- ⚠️ 局限性: ...
```

---

### 调度时间（默认，可配置）

- 每日：`08:30`（Obsidian 内置调度，无需系统 cron）

---

### 项目结构

```
src/
  main.ts                   ← 插件入口 + 命令注册
  settings.ts               ← 设置 schema + 设置页 UI
  types/
    paper.ts                ← Paper, FetchParams, RunState 类型
    config.ts               ← PaperDailySettings 类型
  sources/
    source.ts               ← PaperSource 接口
    arxivSource.ts          ← arXiv Atom API 拉取 + 解析
    hfSource.ts             ← HuggingFace Daily Papers 拉取
    ar5ivFetcher.ts         ← ar5iv HTML 全文抓取
    rssSource.ts            ← stub（预留）
    customApiSource.ts      ← stub（预留）
  scoring/
    interest.ts             ← 兴趣关键词匹配
    directions.ts           ← 方向打分 + 汇总
    rank.ts                 ← 论文排序
  llm/
    provider.ts             ← LLMProvider 接口
    openaiCompatible.ts     ← OpenAI Compatible 实现
    anthropicProvider.ts    ← Anthropic SDK 实现
  pipeline/
    dailyPipeline.ts        ← 每日全流程（拉取→打分→LLM→落盘）
    backfillPipeline.ts     ← 历史回补
  scheduler/
    scheduler.ts            ← 60s tick 调度器
  storage/
    vaultWriter.ts          ← Vault 读写封装
    stateStore.ts           ← 运行状态持久化
    dedupStore.ts           ← 已见论文 ID 去重
    snapshotStore.ts        ← 每日论文数据快照
    hfTrackStore.ts         ← HF 论文追踪记录
    fulltextCache.ts        ← 全文精读缓存
    paperDownloader.ts      ← PDF 下载
```

---

### 技术栈

TypeScript · Obsidian API · esbuild · arXiv Atom API · HuggingFace Papers · @anthropic-ai/sdk

---

### 路线图

- [ ] 周报 / 月报自动生成
- [ ] BibTeX 导出
- [ ] 收藏 / 标注驱动的报告优先级
- [ ] RSS 数据源实现
- [ ] 自定义 API 数据源实现
- [ ] RAG 检索历史论文
- [ ] 侧边栏 UI 面板

---

## English

### Overview

Paper Daily is an Obsidian plugin that automatically fetches the latest papers from **arXiv** and **HuggingFace Daily Papers** every day, generates structured AI-powered digests, and categorizes papers by configurable research directions (RLHF, Agentic RL, Inference Serving, MoE, etc.). Supports multiple prompt templates, full-text deep read injection, PDF download, and historical backfill.

**Ideal for**: AI/ML researchers and engineers who want a persistent, searchable research feed inside their Obsidian vault.

---

### Features

| Feature | Description |
|---------|-------------|
| Daily arXiv fetch | Search by category + keywords, filter to past N hours, deduplicate |
| HuggingFace source | Fetch HF daily featured papers; upvotes are the primary ranking signal |
| AI digest | LLM-generated structured summary with direction tags and keyword highlights |
| Prompt library | 3 built-in templates (Engineering / Quick Scan / Peer Review) + custom templates |
| Direction scoring | Configurable directions with keywords and weights; papers auto-ranked |
| Interest keywords | Personal keyword watchlist with weights — hits highlighted in every digest |
| Deep Read | Fetch top-N papers' full HTML text and inject into the LLM prompt |
| PDF download | Auto-download paper PDFs into the vault |
| Backfill | Retroactively generate digests for any date range |
| Fault-tolerant writes | Network or LLM failures still produce a file with an error note |

---

### Installation

#### Option 1: Copy Files (Recommended)

1. Go to the [Releases](../../releases) page and download the latest:
   - `main.js`
   - `manifest.json`
   - `styles.css` (if present)

2. Create the plugin folder in your vault (if it doesn't exist):
   ```
   <YourVault>/.obsidian/plugins/paper-daily/
   ```

3. Copy the three files into that folder:
   ```
   .obsidian/plugins/paper-daily/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```

4. In Obsidian → Settings → Community Plugins, disable Safe Mode and enable **Paper Daily**.

> **macOS**: `~/Documents/MyVault/.obsidian/plugins/paper-daily/`
> **Windows**: `C:\Users\YourName\Documents\MyVault\.obsidian\plugins\paper-daily\`

#### Option 2: Build from Source

```bash
git clone https://github.com/your-username/paper-daily.git
cd paper-daily
npm install
npm run build
```

Copy `main.js` + `manifest.json` to the vault plugin folder, or symlink the repo:

```bash
ln -s $(pwd) ~/path/to/your/vault/.obsidian/plugins/paper-daily
```

---

### Quick Start

1. Install and enable the plugin, then open **Settings → Paper Daily**
2. Enter your **LLM API Key** and select a provider (DeepSeek / OpenAI / Claude, etc.)
3. Confirm **arXiv Categories** (default: `cs.AI, cs.LG, cs.CL`)
4. Open the command palette (`Ctrl+P`) and run `Paper Daily: Run daily fetch & summarize now`
5. Find your digest at `PaperDaily/inbox/YYYY-MM-DD.md`

---

### Configuration

#### arXiv Fetch

| Setting | Default | Description |
|---------|---------|-------------|
| Categories | `cs.AI,cs.LG,cs.CL` | Comma-separated arXiv categories |
| Keywords | empty | Query keywords, ANDed with categories; leave empty for category-only |
| Interest Keywords | empty | Personal watchlist (`keyword:weight` format) for ranking and highlight |
| Max Results Per Day | 20 | Cap on papers in the daily digest after ranking |
| Time Window | 72h | Fetch papers from the past N hours |
| Sort By | submittedDate | Sort by submission date or last updated date |

#### LLM Provider

One-click presets in settings:

| Provider | Type | Notes |
|----------|------|-------|
| DeepSeek | OpenAI Compatible | Cost-effective, recommended |
| OpenAI | OpenAI Compatible | GPT-4o / GPT-4o-mini |
| Claude | Anthropic | claude-3-5-sonnet / claude-opus-4 |
| Qwen | OpenAI Compatible | Alibaba DashScope |
| GLM / Zhipu | OpenAI Compatible | — |
| Moonshot / Kimi | OpenAI Compatible | — |
| MiniMax | OpenAI Compatible | — |
| Custom | OpenAI Compatible | Any OpenAI-format endpoint |

#### Prompt Library

Three built-in templates, switchable via tabs in settings:

| Template | Style |
|----------|-------|
| Engineering Deep Dive | Full structure with value rating, engineering insights, limitations |
| Quick Scan | Concise — one line per paper, direction signal, HF highlights |
| Peer Review | Academic lens — evaluates method rigor, experiment credibility |

Custom templates supported. Placeholders: `{{date}}` `{{topDirections}}` `{{papers_json}}` `{{hf_papers_json}}` `{{fulltext_section}}` `{{language}}`

---

### Commands

Open the command palette (`Ctrl+P`) and search `Paper Daily`:

| Command | Description |
|---------|-------------|
| `Run daily fetch & summarize now` | Immediately fetch today's papers and generate digest |
| `Backfill daily summaries for date range` | Fill in digests for a past date range |
| `Rebuild index from local cache` | Reload the dedup index from disk |
| `Open settings` | Open the plugin settings tab |

---

### Vault Output Layout

```
PaperDaily/
  inbox/
    2026-02-28.md         ← daily digest
  papers/
    2026-02-28.json       ← raw paper snapshot
    pdf/                  ← downloaded PDFs (when enabled)
  cache/
    state.json            ← run state
    seen_ids.json         ← dedup store
    runs.log              ← run log
    fulltext/             ← full-text cache (when Deep Read is enabled)
```

---

### Project Structure

```
src/
  main.ts                   ← plugin entry point + command registration
  settings.ts               ← settings schema + settings tab UI
  types/
    paper.ts                ← Paper, FetchParams, RunState types
    config.ts               ← PaperDailySettings type
  sources/
    source.ts               ← PaperSource interface
    arxivSource.ts          ← arXiv Atom API fetch + parse
    hfSource.ts             ← HuggingFace Daily Papers fetch
    ar5ivFetcher.ts         ← ar5iv HTML full-text fetcher
    rssSource.ts            ← stub (reserved)
    customApiSource.ts      ← stub (reserved)
  scoring/
    interest.ts             ← interest keyword matching
    directions.ts           ← direction scoring + aggregation
    rank.ts                 ← paper ranking
  llm/
    provider.ts             ← LLMProvider interface
    openaiCompatible.ts     ← OpenAI-compatible implementation
    anthropicProvider.ts    ← Anthropic SDK implementation
  pipeline/
    dailyPipeline.ts        ← end-to-end daily pipeline
    backfillPipeline.ts     ← date-range backfill
  scheduler/
    scheduler.ts            ← 60-second tick scheduler
  storage/
    vaultWriter.ts          ← vault read/write helpers
    stateStore.ts           ← run state persistence
    dedupStore.ts           ← seen paper ID store
    snapshotStore.ts        ← daily paper snapshots
    hfTrackStore.ts         ← HuggingFace paper tracking
    fulltextCache.ts        ← full-text cache management
    paperDownloader.ts      ← PDF downloader
```

---

### Stack

TypeScript · Obsidian API · esbuild · arXiv Atom API · HuggingFace Papers · @anthropic-ai/sdk

---

### Roadmap

- [ ] Weekly / monthly report generation
- [ ] BibTeX export
- [ ] Starred / annotated papers driving report priority
- [ ] RSS source implementation
- [ ] Custom API source implementation
- [ ] RAG over historical papers
- [ ] Sidebar UI panel

---

### License

MIT
