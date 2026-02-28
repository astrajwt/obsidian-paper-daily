import type { PaperDailySettings } from "../types/config";
import type { StateStore } from "../storage/stateStore";

interface SchedulerCallbacks {
  onDaily: () => Promise<void>;
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
    const dailyTime = parseTime(settings.schedule.dailyTime);
    if (now.getHours() === dailyTime.hour && now.getMinutes() === dailyTime.minute) {
      const lastRun = state.lastDailyRun ? new Date(state.lastDailyRun) : null;
      if (!lastRun || !isSameDay(now, lastRun)) {
        await this.callbacks.onDaily();
      }
    }
  }
}
