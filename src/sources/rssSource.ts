import type { Paper, FetchParams } from "../types/paper";
import type { PaperSource } from "./source";

// Stub: RSS source — not yet implemented
export class RssSource implements PaperSource {
  name = "rss";
  enabled = false;

  async fetch(_params: FetchParams): Promise<Paper[]> {
    // TODO: implement RSS feed parsing
    return [];
  }
}
