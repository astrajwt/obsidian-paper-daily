import { requestUrl } from "obsidian";
import type { LLMProvider, LLMInput, LLMOutput } from "./provider";

/** Returns a promise that rejects with an AbortError when the signal fires. */
function abortRejection(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}

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

    const fetchPromise = requestUrl({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    // requestUrl doesn't support AbortSignal, so race against a rejection promise
    const response = input.signal
      ? await Promise.race([fetchPromise, abortRejection(input.signal)])
      : await fetchPromise;

    const json = response.json;
    const text = json?.choices?.[0]?.message?.content ?? "";
    const usage = json?.usage ? {
      inputTokens: json.usage.prompt_tokens ?? 0,
      outputTokens: json.usage.completion_tokens ?? 0
    } : undefined;

    return { text, usage, raw: json };
  }
}
