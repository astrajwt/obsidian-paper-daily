export interface DirectionConfig {
  name: string;
  weight: number;
  match: {
    keywords: string[];
    categories?: string[];
  };
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
  weeklyPromptTemplate: string;
  monthlyPromptTemplate: string;
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

  // Trending (zero-score papers with high hotness)
  trending: {
    enabled: boolean;
    topK: number;       // how many trending papers to include
    minHotness: number; // minimum hotness score to qualify
  };

  // HuggingFace Papers source
  hfSource: {
    enabled: boolean;
  };

  // RSS source [beta]
  rssSource: {
    enabled: boolean;
    feeds: string[];   // one URL per entry
  };

  // Paper full-text download
  paperDownload: {
    enabled: boolean;    // master toggle
    saveHtml: boolean;   // download HTML version and save as .md
    savePdf: boolean;    // download PDF and save as .pdf
    maxPapers: number;   // max papers to download per day
  };

  // Settings UI language (does not affect AI output language)
  uiLanguage?: "zh" | "en";
}
