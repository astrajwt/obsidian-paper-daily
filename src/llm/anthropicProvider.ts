import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMInput, LLMOutput } from "./provider";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(private apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }

  async generate(input: LLMInput): Promise<LLMOutput> {
    // Build user content: optional PDF document block + text prompt
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userContent: any[] = [];
    if (input.pdfBase64) {
      userContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 }
      });
    }
    userContent.push({ type: "text", text: input.prompt });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: input.maxTokens ?? 4096,
      temperature: input.temperature ?? 0.3,
      system: input.system,
      messages: [{ role: "user", content: userContent }]
    });

    const textBlock = response.content.find(b => b.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "";
    const usage = {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0
    };

    return { text, usage, raw: response };
  }
}
