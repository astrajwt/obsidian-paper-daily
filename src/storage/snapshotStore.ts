import type { Paper, DailySnapshot } from "../types/paper";
import type { VaultWriter } from "./vaultWriter";

export class SnapshotStore {
  constructor(private writer: VaultWriter, private rootFolder: string) {}

  private snapshotPath(date: string): string {
    return `${this.rootFolder}/papers/${date}.json`;
  }

  async writeSnapshot(date: string, papers: Paper[], error?: string): Promise<void> {
    const snapshot: DailySnapshot = {
      date,
      papers,
      fetchedAt: new Date().toISOString(),
      error
    };
    await this.writer.writeNote(
      this.snapshotPath(date),
      JSON.stringify(snapshot, null, 2)
    );
  }

  async readSnapshot(date: string): Promise<DailySnapshot | null> {
    const content = await this.writer.readNote(this.snapshotPath(date));
    if (!content) return null;
    try {
      return JSON.parse(content) as DailySnapshot;
    } catch {
      return null;
    }
  }

  async listSnapshotDates(): Promise<string[]> {
    const files = await this.writer.listFolder(`${this.rootFolder}/papers`);
    return files
      .filter(f => f.endsWith(".json"))
      .map(f => f.replace(".json", ""))
      .sort();
  }

  async readSnapshotsForRange(startDate: string, endDate: string): Promise<DailySnapshot[]> {
    const dates = await this.listSnapshotDates();
    const filtered = dates.filter(d => d >= startDate && d <= endDate);
    const results: DailySnapshot[] = [];
    for (const d of filtered) {
      const snap = await this.readSnapshot(d);
      if (snap) results.push(snap);
    }
    return results;
  }
}
