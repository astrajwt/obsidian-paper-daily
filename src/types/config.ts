export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
  builtin?: boolean;
}

export interface DirectionConfig {
  name: string;
  weight: number;
  match: {
    keywords: string[];
    categories?: string[];
  };
  /** Keywords sent to arXiv API query for this direction (OR-ed together).
   *  If empty/omitted, this direction does not add API-level filters.
   *  Use sparingly — these narrow what arXiv returns before local scoring. */
  queryKeywords?: string[];
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
  keywords: string[];
  interestKeywords: InterestKeyword[];
  maxResultsPerDay: number;
  sortBy: "submittedDate" | "lastUpdatedDate";
  timeWindowHours: number;

  // Directions
  directions: DirectionConfig[];
  directionTopK: number;

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

  // Paper full-text download
  paperDownload: {
    savePdf: boolean;
  };

  // Prompt template library
  promptLibrary?: PromptTemplate[];
  activePromptId?: string;

  // Detail section top-K display counts
  arxivDetailTopK: number;  // how many arXiv papers to show in the detailed section
  hfDetailTopK: number;     // how many HF papers to show in the detailed section

  // Deep read: fetch full paper text from arxiv.org/html and inject into LLM prompt
  deepRead?: {
    enabled: boolean;
    topN: number;             // how many top-ranked papers to fetch (default 5)
    maxCharsPerPaper: number; // truncation limit per paper (default 8000)
    cacheTTLDays: number;     // days before cached full texts are pruned (default 60)
    deepReadMaxTokens?: number;       // per-paper output token limit, default 1024
    deepReadPromptTemplate?: string;  // if empty, falls back to DEFAULT_DEEP_READ_PROMPT
  };

  // Settings UI language (does not affect AI output language)
  uiLanguage?: "zh" | "en";
}
