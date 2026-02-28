export interface DirectionConfig {
  name: string;
  weight: number;
  match: {
    keywords: string[];
    categories?: string[];
  };
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
  weeklyDay: number;    // 0=Sun, 6=Sat
  weeklyTime: string;   // "HH:MM"
  monthlyDay: number;   // 1-28
  monthlyTime: string;  // "HH:MM"
}

export interface PaperDailySettings {
  // arXiv fetch
  categories: string[];
  keywords: string[];
  interestKeywords: string[];
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
}
