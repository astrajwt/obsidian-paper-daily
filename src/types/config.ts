export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
  type?: "daily" | "scoring" | "deepread";
  builtin?: boolean;
}

export interface InterestKeyword {
  keyword: string;
  weight: number;  // 1–5, default 1
}

export interface LLMConfig {
  provider: "openai_compatible" | "anthropic";
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  dailyPromptTemplate: string;
}

export interface ScheduleConfig {
  dailyTime: string;    // "HH:MM"
}

export interface PaperDailySettings {
  // arXiv fetch
  categories: string[];
  interestKeywords: InterestKeyword[];
  /** "all" = fetch all papers in categories; "interest_only" = keep only papers with ≥1 interest keyword hit */
  fetchMode: "all" | "interest_only";
  /** Skip papers already seen in previous runs; set false to always re-process all fetched papers */
  dedup: boolean;
  /** How many hours back to search for papers (default 72) */
  timeWindowHours: number;

  // LLM
  llm: LLMConfig;

  // Output
  rootFolder: string;
  language: "zh" | "en";
  includeAbstract: boolean;
  includePdfLink: boolean;

  // Scheduling
  schedule: ScheduleConfig;

  // Backfill
  backfillMaxDays: number;

  // HuggingFace Papers source
  hfSource: {
    enabled: boolean;
    lookbackDays: number;  // if today has no papers, try up to N previous days
    dedup: boolean;        // skip HF papers already seen on a previous day
  };

  // RSS source [beta]
  rssSource: {
    enabled: boolean;
    feeds: string[];   // one URL per entry
  };

  // Prompt template library
  promptLibrary?: PromptTemplate[];
  activePromptId?: string;       // daily
  activeScorePromptId?: string;  // scoring (Step 3b)
  activeDeepReadPromptId?: string; // deepread (Step 3f)

  // Deep read: fetch full paper text from arxiv.org/html and inject into LLM prompt
  deepRead?: {
    enabled: boolean;
    topN: number;                      // how many top-ranked papers to deep-read (default 5)
    deepReadMaxTokens?: number;        // per-paper output token limit, default 2048
    deepReadPromptTemplate?: string;   // if empty, falls back to DEFAULT_DEEP_READ_PROMPT
    outputFolder?: string;             // vault folder for per-paper markdown files; default "{rootFolder}/deep-read"
    tags?: string[];                   // extra tags written to each paper's frontmatter
    fileNameTemplate?: string;         // filename template, supports {{title}} {{arxivId}} {{date}} {{model}} {{year}} {{month}} {{day}}
  };

  // Scoring prompt (Step 3b): if empty falls back to DEFAULT_SCORING_PROMPT
  scoringPromptTemplate?: string;

  // Settings UI language (does not affect AI output language)
  uiLanguage?: "zh" | "en";
}
