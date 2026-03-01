# Paper Daily

> Obsidian plugin — Daily arXiv + HuggingFace paper digest with AI summarization, interest keyword ranking, deep read, and backfill.

[中文说明](#中文说明) | [English](#english)

---

## 中文说明

### 简介

Paper Daily 是一个 Obsidian 插件，每天自动从 **arXiv** 和 **HuggingFace Daily Papers** 拉取你关注领域的最新论文，通过 LLM 分批打分（10 篇/批）后重排，生成结构化每日摘要，并支持对排名最高的论文进行 HTML 全文精读并写入独立笔记。支持任意日期范围回补，所有操作均有悬浮进度组件实时反馈。

**适合人群**：AI/ML 研究者、工程师，希望在 Obsidian 笔记库中持续追踪 arXiv 和 HuggingFace 最新进展。

---

### 核心功能

| 功能 | 说明 |
|------|------|
| 每日拉取 | arXiv 按分类 + 关键词检索，过滤过去 N 小时内的新论文，自动去重 |
| HuggingFace 源 | 抓取 HF 每日精选，HF 点赞数作为排名首要信号 |
| LLM 批量打分 | 每 10 篇调用一次 LLM 打分，结果用于重排序 |
| 兴趣关键词 | 配置带权重的关注词，命中论文排名靠前，摘要中高亮显示 |
| 今日兴趣热度 | 每日摘要顶部以表格形式展示关键词热度排名 |
| AI 摘要 | LLM 生成结构化要点，标注方向、关键词命中 |
| 精选论文 | 对完成深度精读的论文生成独立卡片，含 wikilink |
| Deep Read（深度精读）| 抓取排名最高 N 篇论文的 arxiv.org/html 全文，逐篇 LLM 分析，写入独立笔记 |
| 回补（Backfill）| 日历选择器指定日期范围，补充生成历史每日摘要；与日常运行并行，各有独立悬浮组件 |
| 悬浮进度组件 | 实时显示 token 消耗（紧凑格式：12.3k），含停止按钮 |
| 容灾保障 | 网络或 LLM 报错时仍然落盘文件（含错误说明），产物不断档 |
| 日志轮转 | runs.log 超过 10MB 自动轮转 |

---

### 输出文件结构

```
PaperDaily/
  inbox/
    2026-02-28.md           每日摘要 Markdown
  papers/
    2026-02-28.json         原始论文数据快照
  deep-read/
    2026-02-28/
      paper-title-deep-read-model.md   深度精读笔记（每篇独立文件）
  cache/
    state.json              运行状态
    seen_ids.json           去重记录
    runs.log                运行日志（10MB 上限自动轮转）
```

---

### 安装

#### 方法一：直接复制文件（推荐）

1. 前往本仓库 [Releases](../../releases) 页面，下载最新版本的以下文件：
   - `main.js`
   - `manifest.json`
   - `styles.css`（如有）

2. 在你的 Obsidian Vault 中创建插件目录（如不存在）：
   ```
   <你的 Vault>/.obsidian/plugins/paper-daily/
   ```

3. 将上述文件复制到该目录：
   ```
   .obsidian/plugins/paper-daily/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```

4. 打开 Obsidian → 设置 → 第三方插件，关闭「安全模式」，然后启用 **Paper Daily**。

> macOS 路径示例：`~/Documents/MyVault/.obsidian/plugins/paper-daily/`
> Windows 路径示例：`C:\Users\你的用户名\Documents\MyVault\.obsidian\plugins\paper-daily\`

#### 方法二：开发者本地构建

```bash
git clone https://github.com/your-username/paper-daily.git
cd paper-daily
npm install
npm run build
```

将 `main.js` 和 `manifest.json` 复制到 Vault 插件目录，或使用符号链接：

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
| Interest Keywords | 空 | 关注词（格式 `keyword:weight`），用于排序和高亮 |
| Max Results Per Day | 20 | 每日摘要最多展示的论文数 |
| Time Window | 72h | 拉取过去 N 小时内的论文 |
| Sort By | submittedDate | 按提交日期或最后更新日期排序 |

#### HuggingFace 源

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| Enable HF Source | 开启 | 抓取 HF 每日精选，点赞数合并到排名中 |
| Lookback Days | 3 | 今日无数据时（如周末）向前查找的天数 |
| Dedup HF Papers | 关闭 | 跳过已在历史摘要中出现过的 HF 精选 |

#### LLM 配置

支持的服务商（设置页一键切换）：

| 服务商 | 类型 | 说明 |
|--------|------|------|
| DeepSeek | OpenAI Compatible | 推荐，性价比高 |
| OpenAI | OpenAI Compatible | GPT-4o / GPT-4o-mini |
| Claude | Anthropic SDK | claude-3-5-sonnet / claude-opus-4 |
| Qwen / 通义 | OpenAI Compatible | 阿里云 DashScope |
| GLM / 智谱 | OpenAI Compatible | — |
| Moonshot / Kimi | OpenAI Compatible | — |
| MiniMax | OpenAI Compatible | — |
| Custom | OpenAI Compatible | 任意 OpenAI 格式接口 |

#### Deep Read（深度精读）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| Enable Deep Read | 关闭 | 开启后精读功能激活 |
| Papers to Fetch (topN) | 10 | 每日抓取全文的篇数，范围 1–999 |
| File Name Template | 可配置 | 精读笔记文件名模板，支持变量占位符 |

精读笔记写入路径：`PaperDaily/deep-read/YYYY-MM-DD/[paper-name]-deep-read-[model].md`

---

### 命令

在命令面板（`Ctrl+P`）搜索 `Paper Daily`：

| 命令 | 说明 |
|------|------|
| `Run daily fetch & summarize now` | 立即拉取今日论文并生成摘要 |
| `Backfill daily summaries for date range` | 打开日历选择器，回补指定日期范围的每日摘要 |
| `Rebuild index from local cache` | 从本地缓存重建去重索引 |
| `Open settings` | 打开插件设置页 |

---

### 每日摘要结构

```markdown
---
type: paper-daily
date: 2026-02-28
sources: [arxiv, huggingface]
categories: [cs.AI, cs.LG, cs.CL]
---

# Paper Daily — 2026-02-28

## 今日兴趣领域热度
| 关键词 | 命中数 | 总权重 |
|--------|--------|--------|
| kv cache | 4 | 8.0 |
| agent | 3 | 6.0 |
...

## 今日要点（AI 总结）
- ...

## 精选论文 / Featured Papers
[[paper-title-deep-read-model]]
...

## All Papers
| 标题 | 评分 | 方向 | 命中 | arXiv | HF | Deep Read |
|------|------|------|------|-------|-----|-----------|
...
```

---

### 调度时间

| 任务 | 默认时间 | 说明 |
|------|----------|------|
| 每日拉取 | 08:30 | 插件内置调度，无需系统 cron |

---

### 路线图

- [ ] 周报 / 月报自动生成
- [ ] BibTeX 导出
- [ ] RSS 数据源实现
- [ ] 自定义 API 数据源实现
- [ ] RAG 检索历史论文
- [ ] 侧边栏 UI 面板

---

### 技术栈

TypeScript · Obsidian API · esbuild · arXiv Atom API · HuggingFace Papers · @anthropic-ai/sdk

---

## English

### Overview

Paper Daily is an Obsidian plugin that automatically fetches the latest papers from **arXiv** and **HuggingFace Daily Papers** every day. Papers are LLM-batch-scored (10 per batch) and re-ranked by score, then presented as a structured daily digest. Top-ranked papers can be sent for full-text deep read: the plugin fetches the full HTML from `arxiv.org/html`, runs a per-paper LLM analysis, and writes each result as a standalone note. Date-range backfill is supported, with parallel floating progress widgets for concurrent runs.

**Ideal for**: AI/ML researchers and engineers who want a persistent, searchable paper feed inside their Obsidian vault.

---

### Features

| Feature | Description |
|---------|-------------|
| Daily arXiv fetch | Search by category + keywords, filter to past N hours, deduplicate |
| HuggingFace source | Fetch HF daily featured papers; upvotes are the primary ranking signal |
| LLM batch scoring | Score papers in batches of 10 per LLM call, then re-rank by score |
| Interest keywords | Weighted personal watchlist — hits boost ranking and are highlighted in the digest |
| Keyword hotness table | Top of each digest shows a keyword heat table ranked by hit count and weight |
| AI digest | LLM-generated structured summary with direction tags and keyword highlights |
| Featured Papers section | Deep-read papers appear as wikilinked cards in the digest |
| Deep Read | Fetch top-N papers' full HTML from arxiv.org/html, run per-paper LLM analysis, write standalone notes; topN default 10, range 1–999 |
| Backfill | Calendar date-picker modal for selecting a past date range; runs in parallel with the daily pipeline via separate stacked floating widgets |
| Floating progress widget | Real-time token display (compact format: 12.3k) with a stop button |
| Fault-tolerant writes | Network or LLM failures still produce output files with an error note |
| Log rotation | runs.log is capped at 10 MB and rotated automatically |

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

3. Copy the files into that folder:
   ```
   .obsidian/plugins/paper-daily/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```

4. In Obsidian: Settings → Community Plugins → disable Safe Mode → enable **Paper Daily**.

> macOS: `~/Documents/MyVault/.obsidian/plugins/paper-daily/`
> Windows: `C:\Users\YourName\Documents\MyVault\.obsidian\plugins\paper-daily\`

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
| Keywords | empty | Query keywords, ANDed with categories; leave empty for category-only search |
| Interest Keywords | empty | Personal watchlist in `keyword:weight` format, used for ranking and highlight |
| Max Results Per Day | 20 | Maximum papers shown in the daily digest after ranking |
| Time Window | 72h | Fetch papers from the past N hours |
| Sort By | submittedDate | Sort by submission date or last updated date |

#### HuggingFace Source

| Setting | Default | Description |
|---------|---------|-------------|
| Enable HF Source | on | Fetch HF daily featured papers; upvotes merged into ranking |
| Lookback Days | 3 | Days to look back when today has no data (e.g. weekends) |
| Dedup HF Papers | off | Skip HF papers already seen in past digests |

#### LLM Provider

One-click presets in settings:

| Provider | Type | Notes |
|----------|------|-------|
| DeepSeek | OpenAI Compatible | Cost-effective, recommended |
| OpenAI | OpenAI Compatible | GPT-4o / GPT-4o-mini |
| Claude | Anthropic SDK | claude-3-5-sonnet / claude-opus-4 |
| Qwen | OpenAI Compatible | Alibaba DashScope |
| GLM / Zhipu | OpenAI Compatible | — |
| Moonshot / Kimi | OpenAI Compatible | — |
| MiniMax | OpenAI Compatible | — |
| Custom | OpenAI Compatible | Any OpenAI-format endpoint |

#### Deep Read

| Setting | Default | Description |
|---------|---------|-------------|
| Enable Deep Read | off | Activate full-text deep read for top papers |
| Papers to Fetch (topN) | 10 | Number of papers to deep-read per day; range 1–999 |
| File Name Template | configurable | Template for note filenames with variable placeholders |

Deep-read notes are written to: `PaperDaily/deep-read/YYYY-MM-DD/[paper-name]-deep-read-[model].md`

---

### Commands

Open the command palette (`Ctrl+P`) and search `Paper Daily`:

| Command | Description |
|---------|-------------|
| `Run daily fetch & summarize now` | Immediately fetch today's papers and generate a digest |
| `Backfill daily summaries for date range` | Open the calendar date-picker modal and backfill past digests |
| `Rebuild index from local cache` | Reload the dedup index from disk |
| `Open settings` | Open the plugin settings tab |

---

### Daily Digest Structure

Each daily digest is written to `PaperDaily/inbox/YYYY-MM-DD.md` with the following sections, in order:

1. Frontmatter (`type`, `date`, `sources`, `categories`, ...)
2. `# Paper Daily — YYYY-MM-DD`
3. `## 今日兴趣领域热度` — keyword hotness table (hit count + weighted score)
4. `## 今日要点（AI 总结）` — LLM-generated key takeaways
5. `## 精选论文 / Featured Papers` — wikilinks to deep-read notes
6. `## All Papers` — full ranked table with arXiv link, HF link, Deep Read link, score, one-line summary, and interest hits

---

### Vault Output Layout

```
PaperDaily/
  inbox/
    2026-02-28.md             daily digest
  papers/
    2026-02-28.json           raw paper snapshot
  deep-read/
    2026-02-28/
      paper-title-deep-read-model.md   per-paper deep-read note
  cache/
    state.json                run state
    seen_ids.json             dedup store
    runs.log                  run log (10 MB cap, auto-rotated)
```

---

### Scheduling

| Task | Default Time | Notes |
|------|-------------|-------|
| Daily fetch | 08:30 | Built-in scheduler — no system cron required |

The scheduler uses a 60-second tick with last-run timestamp checks to avoid double-runs.

---

### Roadmap

- [ ] Weekly / monthly report generation
- [ ] BibTeX export
- [ ] RSS source implementation
- [ ] Custom API source implementation
- [ ] RAG over historical papers
- [ ] Sidebar UI panel

---

### Stack

TypeScript · Obsidian API · esbuild · arXiv Atom API · HuggingFace Papers · @anthropic-ai/sdk

---

### License

MIT
