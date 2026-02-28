import type { PaperDailySettings } from "../types/config";
import type { StateStore } from "../storage/stateStore";

export type ScheduledTask = "daily" | "weekly" | "monthly";

interface SchedulerCallbacks {
  onDaily: () => Promise<void>;
  onWeekly: () => Promise<void>;
  onMonthly: () => Promise<void>;
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

function isSameWeek(a: Date, b: Date): boolean {
  // Same ISO week: same year + same week number
  const getWeek = (d: Date) => {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  };
  return a.getFullYear() === b.getFullYear() && getWeek(a) === getWeek(b);
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
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

    // ── Weekly ───────────────────────────────────────────────────
    const weeklyTime = parseTime(settings.schedule.weeklyTime);
    if (
      now.getDay() === settings.schedule.weeklyDay &&
      now.getHours() === weeklyTime.hour &&
      now.getMinutes() === weeklyTime.minute
    ) {
      const lastRun = state.lastWeeklyRun ? new Date(state.lastWeeklyRun) : null;
      if (!lastRun || !isSameWeek(now, lastRun)) {
        await this.callbacks.onWeekly();
      }
    }

    // ── Monthly ──────────────────────────────────────────────────
    const monthlyTime = parseTime(settings.schedule.monthlyTime);
    if (
      now.getDate() === settings.schedule.monthlyDay &&
      now.getHours() === monthlyTime.hour &&
      now.getMinutes() === monthlyTime.minute
    ) {
      const lastRun = state.lastMonthlyRun ? new Date(state.lastMonthlyRun) : null;
      if (!lastRun || !isSameMonth(now, lastRun)) {
        await this.callbacks.onMonthly();
      }
    }
  }
}
