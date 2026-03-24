import { App, Modal, normalizePath, Notice, Plugin, Setting, TFile } from "obsidian";
import type { PaperDailySettings } from "./types/config";
import { DEFAULT_SETTINGS, PaperDailySettingTab } from "./settings";
import { VaultWriter } from "./storage/vaultWriter";
import { StateStore } from "./storage/stateStore";
import { DedupStore } from "./storage/dedupStore";
import { SnapshotStore } from "./storage/snapshotStore";
import { HFTrackStore } from "./storage/hfTrackStore";
import { runDailyPipeline, PipelineAbortError } from "./pipeline/dailyPipeline";
import { runBackfillPipeline } from "./pipeline/backfillPipeline";
import { Scheduler } from "./scheduler/scheduler";
import { ArxivSource } from "./sources/arxivSource";
import { FloatingProgress } from "./ui/floatingProgress";

export default class PaperDailyPlugin extends Plugin {
  settings!: PaperDailySettings;

  private stateStore!: StateStore;
  private dedupStore!: DedupStore;
  private snapshotStore!: SnapshotStore;
  private hfTrackStore!: HFTrackStore;
  private scheduler!: Scheduler;
  private activeAbortController: AbortController | null = null;
  private activeBackfillController: AbortController | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.registerCommands();
    this.addSettingTab(new PaperDailySettingTab(this.app, this));

    // Defer all vault operations until the workspace is fully ready.
    // Obsidian's vault index is not built when onload() fires, so calling
    // vault.createFolder() on an already-existing folder throws an error.
    // loadSettingsFromVaultFile() also requires an indexed vault.
    this.app.workspace.onLayoutReady(async () => {
      await this.loadSettingsFromVaultFile();
      await this.initStorage();
      this.initScheduler();
      void this.runTodayIfMissing();
    });

    console.log("Paper Daily loaded.");
  }

  onunload(): void {
    this.scheduler.stop();
    console.log("Paper Daily unloaded.");
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.llm = Object.assign({}, DEFAULT_SETTINGS.llm, this.settings.llm);
    this.settings.schedule = Object.assign({}, DEFAULT_SETTINGS.schedule, this.settings.schedule);
    this.settings.hfSource = Object.assign({}, DEFAULT_SETTINGS.hfSource, this.settings.hfSource);
    this.settings.rssSource = Object.assign({}, DEFAULT_SETTINGS.rssSource, this.settings.rssSource);
    // Migrate interestKeywords from legacy string[] to InterestKeyword[]
    if (Array.isArray(this.settings.interestKeywords) &&
        this.settings.interestKeywords.length > 0 &&
        typeof (this.settings.interestKeywords as unknown[])[0] === "string") {
      this.settings.interestKeywords = (this.settings.interestKeywords as unknown as string[])
        .map(kw => ({ keyword: kw, weight: 1 }));
    }
    // Auto-detect language from Obsidian locale
    const locale = (window as Window & { moment?: { locale(): string } }).moment?.locale() ?? "";
    this.settings.language = locale.startsWith("zh") ? "zh" : "en";
    // Note: vault config file is loaded later in onLayoutReady, after the vault is indexed.
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    void this.saveSettingsToVaultFile();
  }

  get configFilePath(): string {
    return `${this.settings.rootFolder}/config.json`;
  }

  private async loadSettingsFromVaultFile(): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(this.configFilePath));
      if (!(file instanceof TFile)) return;
      const content = await this.app.vault.read(file);
      const vaultSettings = JSON.parse(content) as Partial<typeof this.settings>;
      this.settings = Object.assign({}, this.settings, vaultSettings);
      // Re-apply nested merges after override
      this.settings.llm = Object.assign({}, DEFAULT_SETTINGS.llm, this.settings.llm);
      this.settings.hfSource = Object.assign({}, DEFAULT_SETTINGS.hfSource, this.settings.hfSource);
      this.settings.rssSource = Object.assign({}, DEFAULT_SETTINGS.rssSource, this.settings.rssSource);
      console.log(`[PaperDaily] Loaded settings from vault: ${this.configFilePath}`);
    } catch {
      // File doesn't exist or parse error — use settings from data.json
    }
  }

  private async saveSettingsToVaultFile(): Promise<void> {
    try {
      const writer = new VaultWriter(this.app);
      await writer.writeNote(this.configFilePath, JSON.stringify(this.settings, null, 2));
    } catch (e) {
      console.error("[PaperDaily] Failed to write vault config file:", e);
    }
  }

  private async initStorage(): Promise<void> {
    const writer = new VaultWriter(this.app);
    this.stateStore = new StateStore(writer, this.settings.rootFolder);
    this.dedupStore = new DedupStore(writer, this.settings.rootFolder);
    this.snapshotStore = new SnapshotStore(writer, this.settings.rootFolder);
    this.hfTrackStore = new HFTrackStore(writer, this.settings.rootFolder);

    await this.stateStore.load();
    await this.dedupStore.load();
    await this.hfTrackStore.load();

    const root = this.settings.rootFolder;
    for (const sub of ["inbox", "papers", "cache"]) {
      await writer.ensureFolder(`${root}/${sub}`);
    }
  }

  private initScheduler(): void {
    this.scheduler = new Scheduler(
      () => this.settings,
      this.stateStore,
      {
        onDaily: () => {
          if (this.activeAbortController) return Promise.resolve(); // manual run in progress
          return this.runDailyWithUI();
        },
        todayFileExists: (date) => this.todayFileExists(date)
      }
    );
    this.scheduler.start();
  }

  private registerCommands(): void {
    this.addCommand({
      id: "run-daily-now",
      name: "Run daily fetch & summarize now",
      callback: () => { void this.runDailyWithUI(); }
    });

    this.addCommand({
      id: "backfill",
      name: "Backfill daily summaries for date range",
      callback: () => {
        new BackfillModal(this.app, this).open();
      }
    });

    this.addCommand({
      id: "rebuild-index",
      name: "Rebuild index from local cache",
      callback: async () => {
        new Notice("Paper Daily: Rebuilding dedup index...");
        try {
          await this.dedupStore.load();
          new Notice("Paper Daily: Index rebuilt.");
        } catch (err) {
          new Notice(`Paper Daily Error: ${String(err)}`);
        }
      }
    });

    this.addCommand({
      id: "open-settings",
      name: "Open settings",
      callback: () => {
        // Navigate to plugin settings
        (this.app as App & { setting: { open(): void; openTabById(id: string): void } })
          .setting?.openTabById("paper-daily");
      }
    });
  }

  async runDaily(onProgress?: (msg: string) => void, signal?: AbortSignal, onTokenUpdate?: (i: number, o: number) => void): Promise<void> {
    await runDailyPipeline(
      this.app,
      this.settings,
      this.stateStore,
      this.dedupStore,
      this.snapshotStore,
      { hfTrackStore: this.hfTrackStore, onProgress, signal, onTokenUpdate }
    );
  }

  /** Run daily pipeline with floating UI and stop button. */
  async runDailyWithUI(): Promise<void> {
    if (this.activeAbortController) {
      new Notice("Paper Daily: 任务已在运行中。");
      return;
    }
    const controller = new AbortController();
    this.activeAbortController = controller;

    const fp = new FloatingProgress(() => {
      controller.abort();
      fp.setMessage("⏹ 正在停止...");
    });
    try {
      await this.runDaily((msg) => fp.setMessage(msg), controller.signal, (i, o) => fp.setTokens(i, o));
      fp.setMessage("✅ 完成！");
      setTimeout(() => fp.destroy(), 3000);
    } catch (err) {
      if (err instanceof PipelineAbortError) {
        fp.setMessage("⏹ 已停止。");
        setTimeout(() => fp.destroy(), 2000);
      } else {
        fp.setMessage(`❌ 错误: ${String(err)}`);
        setTimeout(() => fp.destroy(), 6000);
      }
    } finally {
      this.activeAbortController = null;
    }
  }

  private todayFileExists(date: string): Promise<boolean> {
    const writer = new VaultWriter(this.app);
    return writer.fileExists(`${this.settings.rootFolder}/inbox/${date}.md`);
  }

  /** Called once on startup: silently generate today's file if it is missing. */
  private async runTodayIfMissing(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    if (await this.todayFileExists(today)) return;
    void this.runDailyWithUI();
  }

  async clearDedup(): Promise<void> {
    await this.dedupStore.clear();
  }

  async runBackfill(startDate: string, endDate: string, onProgress: (msg: string) => void, signal?: AbortSignal): Promise<void> {
    const result = await runBackfillPipeline(
      this.app,
      this.settings,
      this.stateStore,
      this.dedupStore,
      this.snapshotStore,
      {
        startDate,
        endDate,
        signal,
        onProgress: (date, index, total) => {
          onProgress(`Processing ${date} (${index}/${total})...`);
        }
      }
    );
    const errCount = Object.keys(result.errors).length;
    if (errCount > 0) {
      onProgress(`Done. ${result.processed.length} succeeded, ${errCount} failed: ${Object.keys(result.errors).join(", ")}`);
    } else {
      onProgress(`Done. ${result.processed.length} days processed.`);
    }
  }

  /** Run backfill pipeline with floating UI and stop button. */
  async runBackfillWithUI(startDate: string, endDate: string): Promise<void> {
    if (this.activeBackfillController) {
      new Notice("Paper Daily: 批量生成已在运行中。");
      return;
    }
    const controller = new AbortController();
    this.activeBackfillController = controller;

    const fp = new FloatingProgress(() => {
      controller.abort();
      fp.setMessage("⏹ 正在停止...");
    }, "📅 批量生成日报");
    try {
      await this.runBackfill(startDate, endDate, (msg) => fp.setMessage(msg), controller.signal);
      fp.setMessage("✅ 完成！");
      setTimeout(() => fp.destroy(), 3000);
    } catch (err) {
      if (err instanceof PipelineAbortError) {
        fp.setMessage("⏹ 已停止。");
        setTimeout(() => fp.destroy(), 2000);
      } else {
        fp.setMessage(`❌ 错误: ${String(err)}`);
        setTimeout(() => fp.destroy(), 6000);
      }
    } finally {
      this.activeBackfillController = null;
    }
  }

  async testFetch(): Promise<{ url: string; total: number; firstTitle: string; error?: string }> {
    const source = new ArxivSource();
    const now = new Date();
    const params = {
      categories: this.settings.categories,
      keywords: [],
      maxResults: 200,
      sortBy: "submittedDate" as const,
      windowStart: new Date(now.getTime() - 72 * 3600 * 1000),
      windowEnd: now
    };
    const url = source.buildUrl(params, 200);
    try {
      const papers = await source.fetch(params);
      return {
        url,
        total: papers.length,
        firstTitle: papers[0]?.title ?? "(none)"
      };
    } catch (err) {
      return { url, total: 0, firstTitle: "", error: String(err) };
    }
  }
}

class BackfillModal extends Modal {
  private plugin: PaperDailyPlugin;

  constructor(app: App, plugin: PaperDailyPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "批量生成日报" });

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();
    const lastWeek = new Date(today);
    lastWeek.setDate(today.getDate() - 7);

    let startInput!: HTMLInputElement;
    let endInput!: HTMLInputElement;

    new Setting(contentEl)
      .setName("开始日期 / Start Date")
      .addText(text => {
        startInput = text.inputEl;
        startInput.type = "date";
        startInput.value = fmt(lastWeek);
      });

    new Setting(contentEl)
      .setName("结束日期 / End Date")
      .addText(text => {
        endInput = text.inputEl;
        endInput.type = "date";
        endInput.value = fmt(today);
      });

    const errorEl = contentEl.createEl("p");
    errorEl.style.cssText = "color:var(--text-error);font-size:0.85em;margin:8px 0 0;min-height:1.2em;";

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText("取消")
        .onClick(() => this.close()))
      .addButton(btn => btn
        .setButtonText("开始生成")
        .setCta()
        .onClick(() => {
          const start = startInput.value;
          const end = endInput.value;
          if (!start || !end) {
            errorEl.setText("请选择开始和结束日期。");
            return;
          }
          if (start > end) {
            errorEl.setText("开始日期不能晚于结束日期。");
            return;
          }
          this.close();
          void this.plugin.runBackfillWithUI(start, end);
        }));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
