import type { PaperDailySettings } from "../types/config";
import type { StateStore } from "../storage/stateStore";

interface SchedulerCallbacks {
  onDaily: () => Promise<void>;
  /** Returns true if today's inbox file already exists on disk. */
  todayFileExists: (date: string) => Promise<boolean>;
}

function parseTime(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { hour: h ?? 8, minute: m ?? 0 };
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export class Scheduler {
  private intervalId: number | null = null;
  private running = false;

  constructor(
    private getSettings: () => PaperDailySettings,
    private stateStore: StateStore,
    private callbacks: SchedulerCallbacks
  ) {}

  start(): void {
    if (this.intervalId !== null) return;
    // Tick every 60 seconds
    this.intervalId = window.setInterval(() => this.tick(), 60 * 1000);
  }

  stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.checkAndRun();
    } finally {
      this.running = false;
    }
  }

  private async checkAndRun(): Promise<void> {
    const now = new Date();
    const settings = this.getSettings();
    const state = this.stateStore.get();

    // ── Daily ────────────────────────────────────────────────────
    // Check if the scheduled time has passed today and hasn't run yet today.
    // Using >= instead of exact-minute equality avoids missed triggers due to
    // setInterval drift or computer sleep/wake cycles.
    const dailyTime = parseTime(settings.schedule.dailyTime);
    const scheduledToday = new Date(now);
    scheduledToday.setHours(dailyTime.hour, dailyTime.minute, 0, 0);
    if (now >= scheduledToday) {
      const lastRun = state.lastDailyRun ? new Date(state.lastDailyRun) : null;
      const alreadyRanToday = lastRun && isSameDay(now, lastRun);
      const today = now.toISOString().slice(0, 10);
      // Run if not run today, or if the output file was deleted since last run.
      if (!alreadyRanToday || !(await this.callbacks.todayFileExists(today))) {
        await this.callbacks.onDaily();
      }
    }
  }
}
