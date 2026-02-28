export interface LLMInput {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  /** Base64-encoded PDF content. Supported by Anthropic provider only. */
  pdfBase64?: string;
}

export interface LLMOutput {
  text: string;
  raw?: unknown;
}

export interface LLMProvider {
  generate(input: LLMInput): Promise<LLMOutput>;
}
