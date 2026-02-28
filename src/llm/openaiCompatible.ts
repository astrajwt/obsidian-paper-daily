import { requestUrl } from "obsidian";
import type { LLMProvider, LLMInput, LLMOutput } from "./provider";

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string
  ) {}

  async generate(input: LLMInput): Promise<LLMOutput> {
    const messages: Array<{ role: string; content: string }> = [];

    if (input.system) {
      messages.push({ role: "system", content: input.system });
    }
    messages.push({ role: "user", content: input.prompt });

    const body = {
      model: this.model,
      messages,
      temperature: input.temperature ?? 0.3,
      max_tokens: input.maxTokens ?? 4096
    };

    const url = this.baseUrl.replace(/\/$/, "") + "/chat/completions";

    const response = await requestUrl({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    const json = response.json;
    const text = json?.choices?.[0]?.message?.content ?? "";

    return { text, raw: json };
  }
}
