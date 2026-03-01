import type { App } from "obsidian";
import type { PaperDailySettings } from "../types/config";
import { StateStore } from "../storage/stateStore";
import { DedupStore } from "../storage/dedupStore";
import { SnapshotStore } from "../storage/snapshotStore";
import { runDailyPipeline, PipelineAbortError } from "./dailyPipeline";

function parseDateYMD(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface BackfillOptions {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  onProgress?: (date: string, index: number, total: number) => void;
  signal?: AbortSignal;
}

export async function runBackfillPipeline(
  app: App,
  settings: PaperDailySettings,
  stateStore: StateStore,
  dedupStore: DedupStore,
  snapshotStore: SnapshotStore,
  options: BackfillOptions
): Promise<{ processed: string[]; errors: Record<string, string> }> {
  const start = parseDateYMD(options.startDate);
  const end = parseDateYMD(options.endDate);

  // Validate range
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

  if (diffDays < 1) {
    throw new Error(`Invalid date range: startDate must be <= endDate`);
  }
  if (diffDays > settings.backfillMaxDays) {
    throw new Error(`Backfill range (${diffDays} days) exceeds backfillMaxDays (${settings.backfillMaxDays})`);
  }

  const dates: string[] = [];
  let current = new Date(start);
  while (current <= end) {
    dates.push(toDateStr(current));
    current = addDays(current, 1);
  }

  const processed: string[] = [];
  const errors: Record<string, string> = {};

  for (let i = 0; i < dates.length; i++) {
    if (options.signal?.aborted) throw new PipelineAbortError();
    const date = dates[i];
    if (options.onProgress) {
      options.onProgress(date, i + 1, dates.length);
    }

    try {
      // For backfill, define window as that full day UTC
      const dayStart = new Date(`${date}T00:00:00Z`);
      const dayEnd = new Date(`${date}T23:59:59Z`);

      await runDailyPipeline(app, settings, stateStore, dedupStore, snapshotStore, {
        targetDate: date,
        windowStart: dayStart,
        windowEnd: dayEnd,
        skipDedup: false,
        signal: options.signal
      });
      processed.push(date);
    } catch (err) {
      errors[date] = String(err);
    }
  }

  return { processed, errors };
}
