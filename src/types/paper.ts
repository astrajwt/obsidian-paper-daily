export type PaperSource = "arxiv" | "rss" | "custom" | "hf";

export interface Paper {
  id: string;               // e.g. "arxiv:2501.12345v2"
  title: string;
  authors: string[];
  abstract: string;
  categories: string[];
  published: string;        // ISO
  updated: string;          // ISO
  links: { html?: string; pdf?: string; hf?: string; localPdf?: string };
  source: PaperSource;

  // HuggingFace enrichment
  hfUpvotes?: number;
  hfStreak?: number;   // consecutive days on HF daily (tracked across runs)

  // computed fields
  interestHits?: string[];
  llmScore?: number;
  llmScoreReason?: string;
  llmSummary?: string;
  deepReadAnalysis?: string;   // Stage 2 per-paper LLM analysis
}

export interface FetchParams {
  categories: string[];
  keywords: string[];
  maxResults: number;
  sortBy: "submittedDate" | "lastUpdatedDate";
  // time window filter
  windowStart: Date;
  windowEnd: Date;
  // optional: for backfill, override time window label
  targetDate?: string; // YYYY-MM-DD
}

export interface RunState {
  lastDailyRun: string;    // ISO or ""
  lastError: {
    time: string;
    stage: "fetch" | "llm" | "write" | "";
    message: string;
  } | null;
}

export type DedupMap = Record<string, string>; // paperId -> firstSeenDate (YYYY-MM-DD)

export interface DailySnapshot {
  date: string;             // YYYY-MM-DD
  papers: Paper[];
  fetchedAt: string;        // ISO
  error?: string;
}
