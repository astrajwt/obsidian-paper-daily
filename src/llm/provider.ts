export interface LLMInput {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  /** Base64-encoded PDF content. Supported by Anthropic provider only. */
  pdfBase64?: string;
  /** PDF URLs to attach as document blocks. Supported by Anthropic provider only; ignored elsewhere. */
  pdfUrls?: string[];
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
