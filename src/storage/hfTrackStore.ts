import type { VaultWriter } from "./vaultWriter";

export interface HFEntry {
  title: string;
  firstSeen: string;   // YYYY-MM-DD
  lastSeen: string;    // YYYY-MM-DD
  count: number;       // total days appeared on HF daily
}

type HFTrackMap = Record<string, HFEntry>;  // key: base arXiv ID (e.g. "arxiv:2502.12345")

export class HFTrackStore {
  private map: HFTrackMap = {};
  private readonly path: string;

  constructor(private writer: VaultWriter, rootFolder: string) {
    this.path = `${rootFolder}/cache/hf_track.json`;
  }

  async load(): Promise<void> {
    const content = await this.writer.readNote(this.path);
    if (content) {
      try { this.map = JSON.parse(content); } catch { this.map = {}; }
    }
  }

  async save(): Promise<void> {
    await this.writer.writeNote(this.path, JSON.stringify(this.map, null, 2));
  }

  // Record that a paper appeared on HF on this date. Returns updated count.
  track(id: string, title: string, date: string): number {
    const existing = this.map[id];
    if (existing) {
      if (existing.lastSeen === date) return existing.count;  // already tracked today
      existing.lastSeen = date;
      existing.count += 1;
      return existing.count;
    }
    this.map[id] = { title, firstSeen: date, lastSeen: date, count: 1 };
    return 1;
  }

  getEntry(id: string): HFEntry | undefined {
    return this.map[id];
  }

  // Was this paper seen before this date?
  seenBefore(id: string, date: string): boolean {
    const e = this.map[id];
    return !!e && e.firstSeen < date;
  }
}
