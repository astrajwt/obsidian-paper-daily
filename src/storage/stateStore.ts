import type { RunState } from "../types/paper";
import type { VaultWriter } from "./vaultWriter";

export class StateStore {
  private state: RunState;
  private readonly path: string;

  constructor(private writer: VaultWriter, rootFolder: string) {
    this.path = `${rootFolder}/cache/state.json`;
    this.state = {
      lastDailyRun: "",
      lastError: null
    };
  }

  async load(): Promise<void> {
    const content = await this.writer.readNote(this.path);
    if (content) {
      try {
        this.state = JSON.parse(content);
      } catch {
        // keep defaults
      }
    }
  }

  async save(): Promise<void> {
    await this.writer.writeNote(this.path, JSON.stringify(this.state, null, 2));
  }

  get(): RunState {
    return { ...this.state };
  }

  async setLastDailyRun(iso: string): Promise<void> {
    this.state.lastDailyRun = iso;
    await this.save();
  }

  async setLastError(stage: RunState["lastError"] extends null ? never : NonNullable<RunState["lastError"]>["stage"], message: string): Promise<void> {
    this.state.lastError = { time: new Date().toISOString(), stage, message };
    await this.save();
  }

  async clearLastError(): Promise<void> {
    this.state.lastError = null;
    await this.save();
  }
}
