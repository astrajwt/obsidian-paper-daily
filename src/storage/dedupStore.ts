import type { DedupMap } from "../types/paper";
import type { VaultWriter } from "./vaultWriter";

export class DedupStore {
  private map: DedupMap = {};
  private readonly path: string;

  constructor(private writer: VaultWriter, rootFolder: string) {
    this.path = `${rootFolder}/cache/seen_ids.json`;
  }

  async load(): Promise<void> {
    const content = await this.writer.readNote(this.path);
    if (content) {
      try {
        this.map = JSON.parse(content);
      } catch {
        this.map = {};
      }
    }
  }

  async save(): Promise<void> {
    await this.writer.writeNote(this.path, JSON.stringify(this.map, null, 2));
  }

  hasId(id: string): boolean {
    return id in this.map;
  }

  async markSeen(id: string, date: string): Promise<void> {
    if (!this.map[id]) {
      this.map[id] = date;
    }
  }

  async markSeenBatch(ids: string[], date: string): Promise<void> {
    for (const id of ids) {
      await this.markSeen(id, date);
    }
    await this.save();
  }

  // Remove entries older than keepDays to limit growth
  async prune(keepDays = 90): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    for (const [id, date] of Object.entries(this.map)) {
      if (date < cutoffStr) {
        delete this.map[id];
      }
    }
    await this.save();
  }

  getMap(): DedupMap {
    return { ...this.map };
  }
}
