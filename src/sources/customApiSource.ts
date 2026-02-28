import type { Paper, FetchParams } from "../types/paper";
import type { PaperSource } from "./source";

// Stub: Custom API source — not yet implemented
export class CustomApiSource implements PaperSource {
  name = "custom";
  enabled = false;

  async fetch(_params: FetchParams): Promise<Paper[]> {
    // TODO: implement custom API source
    return [];
  }
}
