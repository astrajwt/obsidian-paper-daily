export interface LLMInput {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMOutput {
  text: string;
  raw?: unknown;
}

export interface LLMProvider {
  generate(input: LLMInput): Promise<LLMOutput>;
}
