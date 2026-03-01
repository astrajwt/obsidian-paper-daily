# Paper Daily — Daily Pipeline Workflow v0.3

> 文件路径：`src/pipeline/dailyPipeline.ts`
> 触发方式：手动命令 / 每日定时（默认 08:30）/ backfill

---

## 总览

```
Step 1   →  Fetch arXiv
Step 1b  →  Fetch HuggingFace + Merge
Step 2   →  Dedup（全局去重）
Step 2b  →  Interest-only filter（可选）
Step 3   →  关键词排分（hfScore + interestScore）
Step 3b  →  LLM 快速打分（可选，上限 60 篇）
Step 3d  →  PDF 下载（可选）
Step 3f  →  Deep Read 精读（可选，上限 topN 篇）
Step 4   →  LLM 生成日报摘要
Step 5   →  写入 Markdown（inbox/YYYY-MM-DD.md）
Step 6   →  写入 Snapshot JSON（papers/YYYY-MM-DD.json）
Step 7   →  更新去重缓存（seen_ids.json）
Step 8   →  更新 state.json
```

失败策略：Fetch 失败或 LLM 失败均不阻断写入，最终 Markdown 里会包含错误原因。

---

## Step 1 — Fetch arXiv

**做什么**
调用 arXiv Atom API，按分类抓取指定时间窗口内的论文。

**参数（均来自 settings）**

| 参数 | 值 / 来源 |
|---|---|
| categories | 用户配置，如 `cs.AI,cs.LG,cs.CL` |
| keywords | 固定为空数组（不做关键词 API 过滤，靠本地打分） |
| maxResults | 硬编码 200 |
| sortBy | 硬编码 `submittedDate` |
| timeWindow | `[now - timeWindowHours, now]`，`timeWindowHours` 用户可配（默认 72h） |

**输出**
`Paper[]`，每条包含：`id`（如 `arxiv:2501.12345v2`）、`title`、`authors`、`abstract`、`categories`、`published`、`updated`、`links.html`、`links.pdf`、`source: "arxiv"`

**失败行为**：fetchError 记录，继续执行后续步骤。

---

## Step 1b — Fetch HuggingFace + Merge

**做什么**
从 `huggingface.co/papers` 抓取当日精选论文列表（HTML scraping）。今日无数据时（周末/节假日）向前回溯最多 `lookbackDays` 天。

**参数**

| 参数 | 值 / 来源 |
|---|---|
| lookbackDays | 用户可配（默认 3） |
| 触发条件 | `hfSource.enabled !== false`（默认开启） |

**Merge 逻辑**

1. **arXiv ∩ HF**：如果 HF 精选里有论文与 arXiv 结果 id 匹配（去版本号比对），则把 `hfUpvotes` 和 `links.hf` 写入对应 arXiv 论文对象。
2. **HF-only**：HF 精选中不在 arXiv 结果里的论文，直接追加进 `papers[]` 参与后续打分。

**输出**
合并后的 `papers[]`，arXiv 论文可能新增 `hfUpvotes` / `links.hf`；HF-only 论文 `source: "hf"`。

同时保留完整 `hfDailyPapers[]`（原始 HF 列表，后续送 LLM 作为参考）。

---

## Step 2 — Dedup（全局去重）

**做什么**
从 `seen_ids.json`（DedupStore）过滤掉已在之前某天日报中出现过的论文 id。

**参数**

| 参数 | 值 |
|---|---|
| 开关 | `settings.dedup`（用户可配，默认 true） |
| 跳过条件 | `options.skipDedup === true`（backfill 模式可传入） |

**输出**
过滤后的 `papers[]`，已见过的 id 被移除。

---

## Step 2b — Interest-only Filter（可选）

**做什么**
仅在 `fetchMode === "interest_only"` 时执行。预先计算每篇论文的兴趣关键词命中，过滤掉零命中的论文。

**参数**

| 参数 | 值 |
|---|---|
| 触发条件 | `settings.fetchMode === "interest_only"` 且 `interestKeywords.length > 0` |

**命中规则**
逐个关键词在 `title + abstract` 全文中做不区分大小写的子串匹配，写入 `paper.interestHits: string[]`。

**输出**
过滤后的 `papers[]`，每篇至少命中一个兴趣关键词。

---

## Step 3 — 关键词排分

**做什么**
对 `papers[]` 做初步排序，确定 LLM 打分优先处理哪些论文。

**打分公式**
```
rankScore = hfScore + interestScore

hfScore      = hfUpvotes × 1.0  （HF 点赞数）
interestScore = Σ( keyword.weight )  对所有命中的关键词求权重之和
```

**输出**
`rankedPapers[]`，按 `rankScore` 降序排列，`paper.interestHits` 已填充。

---

## Step 3b — LLM 快速打分

**做什么**
用 LLM 对排名靠前的论文做质量评分（1–10），并生成一句话摘要。打分结果覆盖上一步的关键词排分，重新排序。

**触发条件**：`rankedPapers.length > 0 && settings.llm.apiKey` 已配置

**输入截取**：取前 min(总数, 60) 篇，每篇提供：
- `id`
- `title`
- `abstract`（截取前 250 字符）
- `interestHits`
- `hfUpvotes`（如有）

**Prompt（硬编码，不可配置）**

```
Score each paper 1–10 for quality and relevance to the user's interests.

User's interest keywords (higher weight = more important): {kwStr}

Scoring criteria:
- Alignment with interest keywords and their weights
- Technical novelty and depth
- Practical engineering value
- Quality of evaluation / experiments

Return ONLY a valid JSON array, no explanation, no markdown fence:
[{"id":"arxiv:...","score":8,"reason":"one short phrase","summary":"1–2 sentence plain-language summary"},...]

Papers:
{papersForScoring JSON}
```

**参数**
- temperature: 0.1
- maxTokens: min(scoringCap × 150 + 256, 8192)

**输出**
解析 JSON 数组，回填 `paper.llmScore`、`paper.llmScoreReason`、`paper.llmSummary`；
按 `llmScore` 降序重新排列 `rankedPapers[]`。

**失败行为**：非 fatal，保留关键词排名顺序继续。

---

## Step 3d — PDF 下载（可选）

**做什么**
对 `rankedPapers[]` 中所有有 `links.pdf` 的论文逐一下载 PDF，保存到 Vault。

**触发条件**：`settings.paperDownload.savePdf === true`

**存储路径**
```
{rootFolder}/papers/pdf/{YYYY-MM-DD}/{arxivId}.pdf
```

**行为**
- 已存在则跳过（不重复下载）
- 下载成功后写入 `paper.links.localPdf = vault内相对路径`
- 每篇之间 sleep 1200ms（避免频率限制）

**输出**：`paper.links.localPdf` 被填充（供后续 Markdown 构建和 LLM prompt 使用）

---

## Step 3f — Deep Read 精读（可选）

**做什么**
对排名最高的 topN 篇论文，各自发起一次独立 LLM 调用，让模型深度分析该论文。模型会收到 `arxiv.org/html/{id}` URL，如果模型具备 URL 访问能力（如 Claude）可直接读全文。

**触发条件**：`settings.deepRead.enabled === true`

**参数**

| 参数 | 来源 |
|---|---|
| topN | `settings.deepRead.topN`（默认 5） |
| maxTokens | `settings.deepRead.deepReadMaxTokens`（默认 1024） |
| prompt 模板 | `settings.deepRead.deepReadPromptTemplate` 或 DEFAULT_DEEP_READ_PROMPT |
| temperature | 0.2 |

**每篇 Prompt 输入（DEFAULT_DEEP_READ_PROMPT 模板）**

```
Title: {{title}}
Authors: {{authors}}
Interest keyword hits: {{interest_hits}}
Abstract: {{abstract}}
Full paper HTML (read directly if you can access URLs): {{fulltext}}   ← arxiv.org/html/{id}
```

**要求输出格式**
- 核心贡献 / Core Contribution（2–3 句）
- 方法亮点 / Method Highlights（2–4 bullet）
- 实验与结果 / Experiments & Results（2–3 句）
- 工程启示 / Engineering Takeaway（1–2 句）
- 局限性 / Limitations（1–2 句）
- 目标 400 字以内

**输出**
`paper.deepReadAnalysis` 字符串；
所有分析拼合为 `fulltextSection`（Markdown 格式），传入 Step 4 的 `{{fulltext_section}}`。

**失败行为**：单篇失败不影响其他篇，non-fatal。

---

## Step 4 — LLM 日报生成

**做什么**
用用户选定的 Prompt 模板，将全部上下文组装成一个 prompt，调用 LLM 生成最终日报正文。

**触发条件**：`rankedPapers.length > 0 && settings.llm.apiKey` 已配置

**输入数据**

| 占位符 | 内容 |
|---|---|
| `{{date}}` | 当日日期 YYYY-MM-DD |
| `{{papers_json}}` | 前 min(总数, 10) 篇论文的 JSON，每篇含 id/title/abstract(500字)/categories/interestHits/hfUpvotes/links 等 |
| `{{hf_papers_json}}` | HF 每日精选原始列表（前 15 条），含 title/hfUpvotes/streakDays |
| `{{fulltext_section}}` | Deep Read 分析结果（Markdown），未开启时为空字符串 |
| `{{local_pdfs}}` | 已下载 PDF 的论文列表（Markdown 链接），未下载时为空字符串 |
| `{{interest_keywords}}` | 用户兴趣关键词及权重，如 `rlhf(weight:5), agent(weight:5), ...` |
| `{{language}}` | `Chinese (中文)` 或 `English` |

**模型参数**
- provider / model / temperature / maxTokens：全部来自 `settings.llm`

**当前内置 Prompt 模板（工程精读）要求的输出格式**

```
### 今日要点 / Key Takeaways
3–5 bullet points

### 精选论文 / Curated Papers
每篇：⭐评级 / 关键词 / 核心贡献 / 方法核心 / 实验严谨性 / 工程启示 / 局限性 / 建议 / 链接

### HF 社区信号 / HF Community Signal
未被精选覆盖的 HF 热门论文，一行一条

### 今日批次质量 & 结语 / Batch Quality & Closing
2–3 句总结
```

**输出**：`llmDigest` 字符串，写入 Markdown。

**失败行为**：llmError 记录，Markdown 里 AI 摘要区显示错误原因。

---

## Step 5 — 写入 Markdown

**做什么**
将所有内容拼装为 Markdown 文件，写入 Vault。

**输出路径**
```
{rootFolder}/inbox/YYYY-MM-DD.md
```

**文件结构**

```markdown
---
type: paper-daily
date: YYYY-MM-DD
sources: [arxiv, huggingface]
categories: [cs.AI, cs.LG, cs.CL]
interestKeywords: [rlhf(5), agent(5), ...]
---

# Paper Daily — YYYY-MM-DD

## 今日要点（AI 总结） | by {model} 老师 🤖
{llmDigest}

## 本地 PDF / Local PDFs (N 篇)        ← 仅 savePdf=true 且有下载时显示
- [Title A](PaperDaily/papers/pdf/2026-03-01/xxx.pdf)
- ...

## All Papers
| # | Title | Links | Score | Summary | Hits |
|---|-------|-------|-------|---------|------|
| 1 | [Title](arxiv_url) | [arXiv](...) [🤗 HF](...) [PDF](...) [Local PDF](...) | ⭐8/10 | summary | kw1, kw2 |
...
```

---

## Step 6 — 写入 Snapshot JSON

**输出路径**
```
{rootFolder}/papers/YYYY-MM-DD.json
```

**内容**：完整 `Paper[]`，含所有计算字段（llmScore、llmSummary、interestHits、deepReadAnalysis 等），供周报/月报读取。

---

## Step 7 — 更新去重缓存

将本次所有 `rankedPapers` 的 id 写入 `seen_ids.json`（记录 `paperId → firstSeenDate`）。

**条件**：`dedupEnabled === true`（settings.dedup 且非 skipDedup 模式）

---

## Step 8 — 更新 state.json

写入 `lastDailyRun: ISO时间戳`，供 scheduler 判断今天是否已运行过。

**条件**：非 backfill 模式（`options.targetDate` 未传入）

---

## Token 用量统计

每步 LLM 调用的 input/output tokens 累计，最终在进度消息里显示：
```
✅ 完成！42 篇论文 | tokens: 12,450→3,210
```

---

## 附：各步骤数据流示意

```
arXiv API ──────────────────────────────────────┐
                                                 ▼
HF scraper ─────────────→  Merge ──────→  papers[] (≤200+HF)
                                                 │
                                       Step 2: Dedup filter
                                                 │
                                   Step 2b: Interest-only filter (可选)
                                                 │
                                       Step 3: rankPapers()
                                          hfScore + interestScore
                                                 │
                                   Step 3b: LLM scoring (前60篇)
                                          llmScore 覆盖排名
                                                 │
                          ┌──────────────────────┤
                          │                      │
                   Step 3d: PDF下载        Step 3f: Deep Read
                   paper.links.localPdf    paper.deepReadAnalysis
                          │                      │
                          └──────────────────────┘
                                                 │
                                       Step 4: LLM digest
                                         top 10篇 + HF 15条
                                         + deepRead section
                                         + local PDFs list
                                         + interest_keywords
                                                 │
                                Step 5: Markdown → inbox/YYYY-MM-DD.md
                                Step 6: JSON    → papers/YYYY-MM-DD.json
                                Step 7: Dedup   → cache/seen_ids.json
                                Step 8: State   → cache/state.json
```

---

## 可配置项速查

| 设置 | 默认值 | 影响步骤 |
|---|---|---|
| categories | cs.AI,cs.LG,cs.CL | Step 1 |
| timeWindowHours | 72 | Step 1 |
| fetchMode | all | Step 2b |
| dedup | true | Step 2, 7 |
| hfSource.lookbackDays | 3 | Step 1b |
| paperDownload.savePdf | true | Step 3d, Step 5 |
| deepRead.enabled | false | Step 3f |
| deepRead.topN | 5 | Step 3f |
| deepRead.deepReadMaxTokens | 1024 | Step 3f |
| interestKeywords | 10条默认 | Step 2b, 3, 3b, 4 |
| llm.model / temperature / maxTokens | gpt-4o-mini / 0.3 / 4096 | Step 3b, 3f, 4 |
| activePromptId | builtin_engineering | Step 4 |
