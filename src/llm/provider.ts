export interface LLMInput {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMOutput {
  text: string;
  usage?: LLMUsage;
  raw?: unknown;
}

export interface LLMProvider {
  generate(input: LLMInput): Promise<LLMOutput>;
}
