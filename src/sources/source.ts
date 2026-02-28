import type { Paper, FetchParams } from "../types/paper";

export interface PaperSource {
  name: string;
  enabled: boolean;
  fetch(params: FetchParams): Promise<Paper[]>;
}
