import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMInput, LLMOutput } from "./provider";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(private apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }

  async generate(input: LLMInput): Promise<LLMOutput> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: input.maxTokens ?? 4096,
      temperature: input.temperature ?? 0.3,
      system: input.system,
      messages: [{ role: "user", content: input.prompt }]
    });

    const textBlock = response.content.find(b => b.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "";

    return { text, raw: response };
  }
}
