# Paper Daily — Obsidian Plugin

An Obsidian plugin that fetches papers daily from **arXiv** and **HuggingFace Daily Papers**, scores and ranks them with an LLM, and generates structured markdown digests inside your vault.

---

## Features

### Paper Sources
- **arXiv fetch** — queries by category (e.g. `cs.AI`, `cs.LG`, `cs.CL`) and optional keywords, configurable time window (default 30 h), with automatic deduplication across runs
- **HuggingFace Daily Papers** — fetches the HF community paper list; upvote count is used as the primary ranking signal alongside LLM scores

### Scoring & Ranking
- **LLM batch scoring** — papers are sent to the LLM in batches of 10 for relevance scoring before digest generation
- **Interest keywords with weights** — define a list of weighted keywords; papers are ranked and highlighted in the digest based on how many interest keywords they match; matched keywords are surfaced explicitly in each paper entry

### Daily Digest
Each daily run produces a structured markdown note with sections in this order:

1. **今日兴趣领域热度 (Interest Area Hotness)** — a table showing how each configured interest area scored today
2. **AI Digest** — LLM-generated summary of the day's notable themes and takeaways
3. **精选论文 / Featured Papers** — ranked top papers with per-paper LLM analysis, matched interest keywords, and links
4. **All Papers** — a full table of every fetched paper for the day

### Deep Read
- Fetches the full text of a paper from `arxiv.org/html` and runs a dedicated per-paper LLM analysis
- Produces a standalone note in `deep-read/YYYY-MM-DD/[filename].md`
- Configurable number of papers to deep-read per run (`topN`, default 10, range 1–999)
- A floating progress widget shows real-time progress during deep read

### Backfill
- Calendar date picker to select a start and end date
- Runs backfill days in parallel; each day gets its own floating progress widget
- Widgets stack vertically on the right side of the screen so multiple runs are visible simultaneously

### Progress Widgets
- **Floating progress widget** — shown during daily fetch, deep read, and backfill runs
- Displays a real-time token counter in compact format (e.g. `12.3k`)
- Includes a **Stop** button that aborts the current run immediately

### Reliability
- **Fault-tolerant writes** — if the LLM fails, the plugin still writes a note with the paper list and the error reason; no day is left without a file
- **Log rotation** — `runs.log` is automatically rotated when it exceeds 10 MB

### Scheduling
- Daily digest runs automatically at **08:30** (configurable)
- Scheduler uses an in-plugin tick-based mechanism; no system cron required

---

## LLM Providers

The plugin supports the following providers via a unified interface:

| Provider | Notes |
|---|---|
| DeepSeek | Recommended for cost-efficiency |
| OpenAI | GPT-4o and compatible models |
| Claude (Anthropic) | Claude 3.x series |
| Qwen (Alibaba) | Qwen-long and other variants |
| GLM (Zhipu) | GLM-4 series |
| Moonshot | Kimi models |
| MiniMax | MiniMax models |
| Custom | Any OpenAI-compatible endpoint |

---

## Commands

All commands are available from the Obsidian Command Palette (`Ctrl/Cmd + P`):

| Command | Description |
|---|---|
| `Paper Daily: Run daily fetch & summarize now` | Trigger a full daily run immediately |
| `Paper Daily: Backfill daily summaries for date range` | Open the backfill date picker and run for a past date range |
| `Paper Daily: Rebuild index from local cache` | Reconstruct the dedup index from existing JSON snapshots |
| `Paper Daily: Open settings` | Open the plugin settings tab |

---

## Vault Output Layout

The plugin writes all output under a configurable root folder (default `PaperDaily/`) inside your vault:

```
PaperDaily/
  inbox/
    2026-02-28.md          # daily digest note
  papers/
    2026-02-28.json        # raw paper data + computed scores
  deep-read/
    2026-02-28/
      [filename].md        # per-paper deep read note
  cache/
    state.json             # scheduler and last-run state
    seen_ids.json          # dedup store (paperId -> firstSeenDate)
    runs.log               # rolling run log (rotated at 10 MB)
```

---

## Settings Overview

### arXiv Fetch
- `categories` — arXiv category list, e.g. `["cs.AI", "cs.LG", "cs.CL"]`
- `keywords` — optional query keywords
- `timeWindowHours` — fetch window in hours (default `30`)
- `maxResultsPerDay` — cap on papers fetched per day (default `20`)
- `sortBy` — `submittedDate` or `lastUpdatedDate`

### Interest Keywords
- Weighted keyword list; used for ranking and in-digest highlighting
- Matched keywords are shown per paper in the digest

### LLM Provider
- Provider, base URL, API key, model name
- Temperature, max tokens (optional)
- Prompt templates for daily digest

### Deep Read
- Enable/disable
- `topN` — number of papers to deep-read per run (default `10`, range `1–999`)
- File name template with variable placeholders

### Output
- `rootFolder` — vault subfolder for all output (default `PaperDaily`)
- `language` — `zh` or `en`
- `includeAbstract`, `includePdfLink`

### Backfill
- `backfillMaxDays` — maximum date range allowed (default `30`)

---

## Roadmap

The following features are planned for future releases:

- Weekly and monthly report generation (aggregated from daily snapshots)
- BibTeX export per paper
- RSS source integration
- Custom API source integration
- RAG / semantic search over the local paper corpus
- Sidebar panel UI for browsing and filtering papers

---

## Development

Built with TypeScript for Obsidian. The source layout follows a pipeline-oriented architecture:

```
src/
  main.ts
  settings.ts
  scheduler/
  sources/        # arxivSource, hfSource, rssSource (stub), customApiSource (stub)
  scoring/        # interest, directions, rank
  pipeline/       # dailyPipeline, backfillPipeline
  llm/            # provider abstraction, openaiCompatible
  storage/        # vaultWriter, stateStore, dedupStore, snapshotStore
  types/
```

---

## License

MIT
