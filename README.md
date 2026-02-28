# Paper Daily

> Obsidian plugin — Daily arXiv paper digest with AI summarization, direction scoring, and automated weekly/monthly reports.

[中文](#中文说明) | [English](#english)

---

## 中文说明

### 简介

Paper Daily 是一个 Obsidian 插件，每天自动从 **arXiv** 拉取你关注领域的最新论文，通过 AI 生成结构化的每日摘要，并按研究方向（RLHF、Agentic RL、Inference Serving、MoE 等）自动分类和打分。支持每周/每月报告，以及历史日期回补。

**适合人群**：AI/ML 研究者、工程师，希望在 Obsidian 笔记库中持续追踪 arXiv 最新进展。

### 核心功能

| 功能 | 说明 |
|------|------|
| 每日拉取 | 按分类 + 关键词检索，过滤过去 N 小时内的新论文，自动去重 |
| AI 摘要 | 调用 LLM 生成结构化每日要点，标注方向、关键词命中 |
| 方向打分 | 可配置"研究方向"（含关键词 + 权重），每篇论文自动归类并排序 |
| 兴趣关键词 | 配置你最关注的词，摘要中突出显示命中情况 |
| 周报 / 月报 | 自动汇聚每日快照，生成趋势分析报告 |
| 历史回补 | 指定日期范围，补充生成历史每日摘要 |
| 容灾保障 | 网络失败或 LLM 报错时，仍然落盘文件（含错误说明），产物不断档 |

### 输出文件结构

```
PaperDaily/
  inbox/
    2026-02-28.md       ← 每日摘要
  weekly/
    2026-W09.md         ← 周报
  monthly/
    2026-02.md          ← 月报
  papers/
    2026-02-28.json     ← 原始论文数据快照
  cache/
    state.json          ← 运行状态
    seen_ids.json       ← 去重记录
    runs.log            ← 运行日志
```

### 安装

#### 手动安装（推荐开发者）

```bash
# 克隆仓库
git clone https://github.com/your-username/paper-daily.git
cd paper-daily

# 安装依赖
npm install

# 编译
npm run build

# 符号链接到 Obsidian 插件目录
ln -s $(pwd) ~/path/to/your/vault/.obsidian/plugins/paper-daily
```

然后在 Obsidian → 设置 → 第三方插件 中启用 **Paper Daily**。

#### BRAT 安装（Beta Reviewers Auto-update Tester）

在 BRAT 插件中添加本仓库地址即可自动安装。

### 配置

在 Obsidian 设置 → Paper Daily 中配置：

**arXiv 拉取**
- `Categories`：arXiv 分类，如 `cs.AI,cs.LG,cs.CL`
- `Keywords`：查询关键词（可选），与分类 AND 组合
- `Interest Keywords`：你最关心的词，用于排序和高亮
- `Max Results Per Day`：每日最多展示论文数（默认 20）
- `Time Window`：拉取过去 N 小时的论文（默认 30h）

**研究方向**

内置方向（可在设置中用 JSON 自定义）：

| 方向 | 默认关键词 |
|------|------------|
| RLHF & Post-training | rlhf, ppo, dpo, grpo, reward model, preference |
| Agentic RL | agent, tool use, planner, react, function calling |
| Inference Serving | kv cache, pagedattention, speculative, vllm, sglang |
| Training Systems | fsdp, zero, deepspeed, megatron, pipeline parallel |
| MoE | moe, mixture of experts, expert, routing |

**LLM 配置**
- 支持 **OpenAI Compatible**（OpenAI、DeepSeek、Qwen 等任意兼容接口）
- 支持 **Anthropic**（Claude）
- 可自定义 Base URL、Model、Temperature、Prompt 模板

**调度时间**（默认值）
- 每日：`08:30`
- 周报：每周六 `18:00`
- 月报：每月 1 日 `09:00`

### 命令

在命令面板（`Ctrl+P`）搜索 `Paper Daily`：

| 命令 | 说明 |
|------|------|
| `Run daily fetch & summarize now` | 立即拉取今日论文并生成摘要 |
| `Backfill daily summaries for date range` | 回补指定日期范围的每日摘要 |
| `Generate weekly report now` | 立即生成本周周报 |
| `Generate monthly report now` | 立即生成本月月报 |
| `Rebuild index from local cache` | 从本地缓存重建去重索引 |
| `Open settings` | 打开插件设置页 |

### 每日摘要示例

```markdown
---
type: paper-daily
date: 2026-02-28
sources: [arxiv]
categories: [cs.AI, cs.LG, cs.CL]
---

# Paper Daily — 2026-02-28

## Top Directions Today
- **RLHF & Post-training** (score: 12.4)
- **Agentic RL** (score: 8.7)
- **Inference Serving** (score: 6.2)

## 今日要点（AI 总结）
- ...

## Top Papers (ranked)
1. **Some Paper Title**
   - Directions: RLHF & Post-training, Agentic RL
   - Interest hits: rlhf, reward model
   - Links: [arXiv](...), [PDF](...)
```

### 开发

```bash
# 开发模式（watch）
npm run dev

# 生产构建
npm run build
```

**技术栈**：TypeScript · Obsidian API · esbuild · arXiv Atom API · @anthropic-ai/sdk

### 路线图

- [ ] PDF 下载与本地存储
- [ ] BibTeX 导出
- [ ] 收藏 / 标注驱动的周报优先级
- [ ] RSS 数据源
- [ ] 自定义 API 数据源
- [ ] RAG 检索历史论文
- [ ] UI 面板（侧边栏）

---

## English

### Overview

Paper Daily is an Obsidian plugin that automatically fetches the latest papers from **arXiv** every day, generates structured AI-powered digests, and categorizes papers by configurable research directions (RLHF, Agentic RL, Inference Serving, MoE, etc.). It also produces weekly and monthly trend reports, and supports backfilling historical dates.

**Ideal for**: AI/ML researchers and engineers who want a persistent, searchable research feed inside their Obsidian vault.

### Features

| Feature | Description |
|---------|-------------|
| Daily fetch | Search by category + keywords, filter to the past N hours, deduplicate |
| AI digest | LLM-generated structured summary with direction tags and keyword highlights |
| Direction scoring | Configurable research directions with keywords and weights; papers auto-ranked |
| Interest keywords | Your personal keyword watchlist — hits highlighted in every digest |
| Weekly / Monthly reports | Aggregates daily snapshots into trend reports |
| Backfill | Retroactively generate digests for any date range |
| Fault-tolerant writes | Network or LLM failures still produce a file with an error note |

### Vault Output Layout

```
PaperDaily/
  inbox/
    2026-02-28.md       ← daily digest
  weekly/
    2026-W09.md         ← weekly report
  monthly/
    2026-02.md          ← monthly report
  papers/
    2026-02-28.json     ← raw paper snapshot
  cache/
    state.json          ← run state
    seen_ids.json       ← dedup store
    runs.log            ← run log
```

### Installation

#### Manual (for developers)

```bash
git clone https://github.com/your-username/paper-daily.git
cd paper-daily
npm install
npm run build
ln -s $(pwd) ~/path/to/your/vault/.obsidian/plugins/paper-daily
```

Then enable **Paper Daily** in Obsidian → Settings → Community Plugins.

#### Via BRAT

Add this repository URL in the BRAT plugin to install and auto-update.

### Configuration

Open Obsidian Settings → Paper Daily:

**arXiv Fetch**
- `Categories`: arXiv categories, e.g. `cs.AI,cs.LG,cs.CL`
- `Keywords`: optional query keywords, ANDed with categories
- `Interest Keywords`: your personal watchlist for ranking and highlighting
- `Max Results Per Day`: cap on papers shown per day (default 20)
- `Time Window`: fetch papers from the past N hours (default 30)

**Directions / Themes**

Built-in directions (fully customizable via JSON in settings):

| Direction | Default Keywords |
|-----------|-----------------|
| RLHF & Post-training | rlhf, ppo, dpo, grpo, reward model, preference |
| Agentic RL | agent, tool use, planner, react, function calling |
| Inference Serving | kv cache, pagedattention, speculative, vllm, sglang |
| Training Systems | fsdp, zero, deepspeed, megatron, pipeline parallel |
| MoE | moe, mixture of experts, expert, routing |

**LLM Provider**
- **OpenAI Compatible**: works with OpenAI, DeepSeek, Qwen, or any OpenAI-format API
- **Anthropic**: Claude models via the Anthropic SDK
- Configurable: Base URL, Model, Temperature, Max Tokens, and prompt templates

**Scheduling** (defaults, all configurable)
- Daily: `08:30`
- Weekly: Saturday `18:00`
- Monthly: 1st of month `09:00`

> The scheduler runs entirely within Obsidian (60-second tick with last-run timestamp guards) — no system cron required.

### Commands

Open the command palette (`Ctrl+P`) and search `Paper Daily`:

| Command | Description |
|---------|-------------|
| `Run daily fetch & summarize now` | Immediately fetch today's papers and generate digest |
| `Backfill daily summaries for date range` | Fill in digests for a past date range |
| `Generate weekly report now` | Generate this week's report immediately |
| `Generate monthly report now` | Generate this month's report immediately |
| `Rebuild index from local cache` | Reload the dedup index from disk |
| `Open settings` | Open the plugin settings tab |

### Daily Digest Example

```markdown
---
type: paper-daily
date: 2026-02-28
sources: [arxiv]
categories: [cs.AI, cs.LG, cs.CL]
---

# Paper Daily — 2026-02-28

## Top Directions Today
- **RLHF & Post-training** (score: 12.4)
- **Agentic RL** (score: 8.7)
- **Inference Serving** (score: 6.2)

## Key Takeaways (AI Summary)
- ...

## Top Papers (ranked)
1. **Some Paper Title**
   - Directions: RLHF & Post-training, Agentic RL
   - Interest hits: rlhf, reward model
   - Links: [arXiv](...), [PDF](...)
```

### Development

```bash
# Watch mode
npm run dev

# Production build
npm run build
```

**Stack**: TypeScript · Obsidian API · esbuild · arXiv Atom API · @anthropic-ai/sdk

### Project Structure

```
src/
  main.ts                 ← plugin entry point + commands
  settings.ts             ← settings schema + UI tab
  types/
    paper.ts              ← Paper, FetchParams, RunState types
    config.ts             ← PaperDailySettings type
  sources/
    arxivSource.ts        ← arXiv Atom API fetch + parse
    rssSource.ts          ← stub
    customApiSource.ts    ← stub
  scoring/
    interest.ts           ← interest keyword matching
    directions.ts         ← direction scoring + aggregation
    rank.ts               ← paper ranking
  llm/
    provider.ts           ← LLMProvider interface
    openaiCompatible.ts   ← OpenAI-compatible provider
    anthropicProvider.ts  ← Anthropic provider
  pipeline/
    dailyPipeline.ts      ← end-to-end daily pipeline
    backfillPipeline.ts   ← date-range backfill
    weeklyPipeline.ts     ← weekly aggregation
    monthlyPipeline.ts    ← monthly aggregation
  scheduler/
    scheduler.ts          ← 60s tick scheduler
  storage/
    vaultWriter.ts        ← vault read/write helpers
    stateStore.ts         ← run state persistence
    dedupStore.ts         ← seen paper IDs
    snapshotStore.ts      ← daily paper snapshots
```

### Roadmap

- [ ] PDF download and local storage
- [ ] BibTeX export
- [ ] Starred/annotated papers driving weekly report priority
- [ ] RSS source implementation
- [ ] Custom API source implementation
- [ ] RAG over historical papers
- [ ] Sidebar UI panel

### License

MIT
