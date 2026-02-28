# CLAUDE.md — Paper Daily (Obsidian Plugin) Architecture & Implementation Guide

> Project: **Paper Daily**
> Goal: Obsidian 插件：每日从 **arXiv** 拉取指定领域/tag/关键词的论文，生成 **Daily 摘要**，并自动产出 **周报 / 月报**。后续扩展 RSS / 自定义 API 源。
> Vault: `~/JwtVault/`
> Output root folder inside vault: `PaperDaily/`

---

## 0. Product Requirements (MVP + 必备增强)

### Must-have
1. **Daily arXiv fetch**：按分类（tag）+ 关键词检索，获取过去 `timeWindowHours` 内新增论文（默认 30h），去重。
2. **AI Daily Digest**：生成每日总结 markdown，要求：
   - 输出中显式体现 **方向 / 主题（Directions/Themes）**（例如：RLHF、Agentic RL、Inference Serving、Training Systems、MoE、KV Cache 等）
   - 支持配置 **感兴趣关键词（Interest Keywords）**，在摘要里体现关键词命中、优先级与过滤策略
3. **Weekly / Monthly**：
   - Weekly：每周六 18:00 生成周报（也可手动触发）
   - Monthly：每月 1 号 09:00 生成月报（也可手动触发）
4. **可追溯 / 回溯**：
   - 支持用户指定 **过去时间段**（date range）回补拉取并生成当日摘要（backfill），并可用于补周报/月报数据
5. **稳定落盘**：
   - 拉取失败/LLM 失败也要落盘：至少落一份"论文列表 + 错误原因"，保证产物不断档
6. **后续扩展预埋**：
   - RSS Source（stub）
   - Custom API Source（stub）

### Nice-to-have (later)
- PDF 下载、BibTeX、标注/收藏驱动周报优先级、RAG、UI 面板等

---

## 1. UX & Commands

### Commands (Command Palette)
- `Paper Daily: Run daily fetch & summarize now`
- `Paper Daily: Backfill daily summaries for date range`
- `Paper Daily: Generate weekly report now`
- `Paper Daily: Generate monthly report now`
- `Paper Daily: Rebuild index from local cache`
- `Paper Daily: Open settings`

### Scheduling defaults (configurable)
- Daily: 08:30
- Weekly: Sat 18:00
- Monthly: day 1 at 09:00

> NOTE: Obsidian 插件不要依赖系统 cron。使用插件内 scheduler：定时 tick + lastRun 时间戳判断 shouldRun。

---

## 2. Vault Output Layout

Inside vault (`~/JwtVault/`), plugin writes into:

```
PaperDaily/
  inbox/
    2026-02-28.md
  weekly/
    2026-W09.md
  monthly/
    2026-02.md
  papers/
    2026-02-28.json
  cache/
    state.json
    seen_ids.json
    runs.log
  templates/           # optional override
    daily.md
    weekly.md
    monthly.md
```

---

## 3. Settings Schema (Obsidian Settings Tab)

### 3.1 arXiv fetch
- `categories: string[]` (e.g. `["cs.AI","cs.LG","cs.CL"]`)
- `keywords: string[]` (query keywords; optional)
- `interestKeywords: string[]` (**用户感兴趣关键词**，用于打分/突出显示)
- `maxResultsPerDay: number` default 20
- `sortBy: "submittedDate" | "lastUpdatedDate"` default submittedDate
- `timeWindowHours: number` default 30

### 3.2 Directions / Themes (方向配置)
We need explicit "方向"概念，可配置 mapping：
- `directions: Array<{ name: string; weight: number; match: { keywords: string[]; categories?: string[] } }>`
  - Example:
    - RLHF & Post-training: keywords ["rlhf","ppo","dpo","grpo","reward model","preference"]
    - Agentic RL: ["agent","tool","planner","react","function calling","multi-agent"]
    - Inference Serving: ["kv cache","pagedattention","speculative","vllm","sglang","tensorrt"]
    - Training Systems: ["fsdp","zero","deepspeed","megatron","pipeline parallel","checkpoint"]
    - MoE: ["moe","expert","alltoall","routing"]
- `directionTopK: number` default 5

**Direction scoring rule (MVP):**
- For each paper, compute `direction_score = sum(matches * direction.weight)`
- Matches check title+abstract lowercased; optionally category match adds bonus.
- Daily summary should include:
  - Today's Top Directions (ranked)
  - Each Top Paper associated Directions + which keywords matched

### 3.3 LLM Provider (abstract)
- `provider: "openai_compatible" | "anthropic" | "custom"`
- `baseUrl: string`
- `apiKey: string`
- `model: string`
- `temperature, maxTokens` optional
- Prompt templates:
  - `dailyPromptTemplate`
  - `weeklyPromptTemplate`
  - `monthlyPromptTemplate`

### 3.4 Output formatting
- `rootFolder: string` default "PaperDaily"
- `language: "zh" | "en"` default zh
- `includeAbstract: boolean` default true
- `includePdfLink: boolean` default true

### 3.5 Backfill
- `backfillMaxDays: number` default 30 (guardrail)
- Backfill should support:
  - `startDate`, `endDate` user input (YYYY-MM-DD)
  - For each day, fetch papers for that day window (see backfill logic below)

---

## 4. Core Data Model

### Paper (normalized)
```ts
type Paper = {
  id: string;                 // e.g. "arxiv:2501.12345v2"
  title: string;
  authors: string[];
  abstract: string;
  categories: string[];
  published: string;          // ISO
  updated: string;            // ISO
  links: { html?: string; pdf?: string };
  source: "arxiv" | "rss" | "custom";

  // computed fields (not required to store)
  interestHits?: string[];    // matched interestKeywords
  directionScores?: Record<string, number>;
  topDirections?: string[];
};
```

### Run State
```json
{
  "lastDailyRun": "...",
  "lastWeeklyRun": "...",
  "lastMonthlyRun": "...",
  "lastError": { "time": "...", "stage": "fetch|llm|write", "message": "..." }
}
```

### Dedup Store (`seen_ids.json`)
```
map: paperId -> firstSeenDate
```
optional trimming later

---

## 5. arXiv Source Integration (Atom API)

### Query building (MVP)

- Categories: `(cat:cs.AI OR cat:cs.LG OR ...)`
- Keywords: `(all:"reinforcement learning" OR all:agent OR ...)`
- Combined: `(<cats>) AND (<keywords>)`
- If keywords empty -> only categories clause.

Use:
- `max_results = maxResultsPerDay * 3` (over-fetch then score+cut to TopN)
- `sort: submittedDate desc` (default)

### Parsing

Parse Atom XML entries into `Paper[]`:
- `id` (extract arXiv id + version)
- `title`, `summary` (abstract), `authors`
- `published`/`updated`
- `link rel alternate/pdf`
- `category` tags

---

## 6. Interest Keywords + Direction Scoring

### 6.1 Interest Keywords (用户感兴趣关键词)

Used in two ways:
- **Ranking**: papers with more interest hits ranked higher
- **Highlighting**: summary must show which keywords were hit per paper

Matching:
- normalize: lowercase, remove extra spaces
- hit if keyword substring appears in title or abstract
- store `interestHits: string[]`

### 6.2 Directions (方向)

Direction scoring computed before LLM prompt:

For each direction:
- count keyword hits in title/abstract
- add category bonus if matches
- multiply by `direction.weight`

Save `topDirections` per paper (top 1-3)

Aggregate daily direction histogram:
- `directionName -> totalScore or paperCount`

Daily digest must include:
- **Top Directions Today** (ranked, with counts)
- **Notable Shifts**: if yesterday data exists, compare direction distribution (optional MVP+)

---

## 7. Pipelines

### 7.1 Daily Pipeline

Steps:
1. load settings, state, dedup
2. build fetch params (time window)
3. fetch from `arxivSource`
4. normalize + dedup
5. compute interestHits + directionScores
6. rank papers:
   - primary: directionScore sum + interestHitCount
   - secondary: recency (updated/published)
7. select topK for LLM (e.g. 10) but also include full list in markdown
8. call LLM to generate digest (structured)
9. write:
   - `PaperDaily/inbox/YYYY-MM-DD.md`
   - `PaperDaily/papers/YYYY-MM-DD.json` (store papers + computed hits/scores)
10. update state + dedup + log

Error behavior:
- If fetch fails => still write `inbox/YYYY-MM-DD.md` with error + empty list
- If LLM fails => write list + "LLM failed" reason

### 7.2 Weekly Pipeline

Input:
- Past 7 days JSON snapshots (`papers/YYYY-MM-DD.json`) preferred

Compute:
- direction trend
- top recurring keywords

LLM prompt includes:
- top papers across week by score

Output:
- `weekly/YYYY-Www.md`

### 7.3 Monthly Pipeline

Input:
- all daily snapshots for month

Compute trends:
- direction evolution
- stable vs emerging themes

Output:
- `monthly/YYYY-MM.md`

---

## 8. Backfill (追溯过去时间段)

### Backfill command behavior

User inputs:
- `startDate` (YYYY-MM-DD)
- `endDate` (YYYY-MM-DD)

Rules:
- Validate range <= `backfillMaxDays`
- For each date D in [startDate, endDate]:
  - define day window: [D 00:00, D 23:59] in local timezone
  - fetch papers updated/published in that window:
    - arXiv API doesn't support direct date-range filtering well; MVP workaround:
      - fetch by categories/keywords with max_results high enough
      - filter locally by published/updated within window
      - if too few, expand fetch size (bounded) or widen window by ±12h
  - generate daily digest markdown + json snapshot for D
  - do not overwrite existing unless user chooses (MVP: overwrite allowed, but log it)

Backfill should also update dedup store.

---

## 9. Markdown Output Specs

### 9.1 Daily Markdown (`inbox/YYYY-MM-DD.md`)

Must be stable structure for later aggregation.

Suggested template:

````markdown
---
type: paper-daily
date: 2026-02-28
sources: [arxiv]
categories: [cs.AI, cs.LG]
keywords: [...]
interestKeywords: [...]
---

# Paper Daily — 2026-02-28

## Top Directions Today
- Direction A (score/count): ...
- Direction B ...

## 今日要点（AI 总结）
- ...
- ...

## Top Papers (ranked)
1. **Title** — 一句话贡献
   - Directions: A, B
   - Interest hits: k1, k2
   - Why it matters: ...
   - Limitations: ...
   - Links: [arXiv](...), [PDF](...)
   - Authors: ...

## All Papers (raw)
- Title | updated | directions | interest hits | links
````

### 9.2 Weekly / Monthly

Must include:
- Top Directions
- Top recurring interest keywords
- Recommended deep dives (top papers)

---

## 10. Module Layout (TypeScript)

```
src/
  main.ts
  settings.ts

  scheduler/
    scheduler.ts

  sources/
    source.ts
    arxivSource.ts
    rssSource.ts        # stub
    customApiSource.ts  # stub

  scoring/
    interest.ts
    directions.ts
    rank.ts

  pipeline/
    dailyPipeline.ts
    weeklyPipeline.ts
    monthlyPipeline.ts
    backfillPipeline.ts

  llm/
    provider.ts
    openaiCompatible.ts

  storage/
    vaultWriter.ts
    stateStore.ts
    dedupStore.ts
    snapshotStore.ts

  types/
    paper.ts
    config.ts
```

Key interfaces:

```ts
interface PaperSource {
  name: string;
  enabled: boolean;
  fetch(params: FetchParams): Promise<Paper[]>;
}

interface LLMProvider {
  generate(input: { system?: string; prompt: string; temperature?: number; maxTokens?: number })
    : Promise<{ text: string; raw?: any }>;
}
```

---

## 11. Implementation Notes (Obsidian specifics)

- Use `this.app.vault` APIs to read/write files
- For scheduler: `setInterval` tick every 60s; compare now to configured times; also ensure day/week/month not double-run by checking state timestamps
- Commands registered via `addCommand`
- Settings via `PluginSettingTab`

---

## 12. Default Prompt Guidance (for LLM)

Daily prompt must explicitly require:
- 输出 "Top Directions Today"
- 每篇论文标注 Directions + interest hits
- 强调面向工程/AI infra/RL/agent 的解读：贡献、限制、工程启示

Claude should implement prompt templates with placeholders:
- `{{date}}`
- `{{topDirections}}` (precomputed)
- `{{papers_json}}` (structured list)

---

## 13. Definition of Done (MVP)

- Settings 可配置 categories/keywords/interestKeywords/directions
- Daily 自动产出 md + json
- Backfill 命令可用（按日期范围生成 daily md + json）
- Weekly/月报可手动生成（定时可选但建议实现）
- 去重可用、失败可恢复、产物不断档
- RSS/custom source 文件存在且接口预留（stub）

---

## 14. Work Plan (Claude: implement in this order)

1. `settings.ts`: settings schema + UI
2. `storage`: stateStore + dedupStore + vaultWriter + snapshotStore
3. `sources`: arxivSource fetch+parse
4. `scoring`: interest + directions + rank
5. `pipeline`: dailyPipeline end-to-end (command-run first)
6. `scheduler`: daily auto-run
7. `backfillPipeline` + command
8. `weekly/monthly` pipeline (read snapshots -> summarize)
9. stubs: rssSource/customApiSource

---

## 15. Guardrails / Constraints

- Backfill range limit (`backfillMaxDays`)
- Fetch `max_results` bounded (avoid huge API calls)
- LLM failures must not block writing files
- Avoid rewriting files accidentally without log

---

## 16. Test Checklist

- Configure only categories, no keywords: daily still works
- Configure interestKeywords: ranking & highlighting works
- Configure directions: daily shows Top Directions
- Backfill 3-day range: generates 3 daily files + snapshots
- Weekly/monthly reads snapshots and produces summary
- Kill network: still writes daily file with error log
