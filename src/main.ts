import { App, Modal, Notice, Plugin, Setting } from "obsidian";
import type { PaperDailySettings } from "./types/config";
import { DEFAULT_SETTINGS, PaperDailySettingTab } from "./settings";
import { VaultWriter } from "./storage/vaultWriter";
import { StateStore } from "./storage/stateStore";
import { DedupStore } from "./storage/dedupStore";
import { SnapshotStore } from "./storage/snapshotStore";
import { runDailyPipeline } from "./pipeline/dailyPipeline";
import { runBackfillPipeline } from "./pipeline/backfillPipeline";
import { runWeeklyPipeline } from "./pipeline/weeklyPipeline";
import { runMonthlyPipeline } from "./pipeline/monthlyPipeline";
import { Scheduler } from "./scheduler/scheduler";
import { ArxivSource } from "./sources/arxivSource";
import { VaultLinker } from "./linking/vaultLinker";

export default class PaperDailyPlugin extends Plugin {
  settings!: PaperDailySettings;

  private stateStore!: StateStore;
  private dedupStore!: DedupStore;
  private snapshotStore!: SnapshotStore;
  private scheduler!: Scheduler;
  private linker!: VaultLinker;

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.initStorage();
    this.initLinker();
    this.initScheduler();
    this.registerCommands();
    this.addSettingTab(new PaperDailySettingTab(this.app, this));
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
    this.settings.vaultLinking = Object.assign({}, DEFAULT_SETTINGS.vaultLinking, this.settings.vaultLinking);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async initStorage(): Promise<void> {
    const writer = new VaultWriter(this.app);
    this.stateStore = new StateStore(writer, this.settings.rootFolder);
    this.dedupStore = new DedupStore(writer, this.settings.rootFolder);
    this.snapshotStore = new SnapshotStore(writer, this.settings.rootFolder);

    await this.stateStore.load();
    await this.dedupStore.load();

    // Ensure root folder structure
    const root = this.settings.rootFolder;
    for (const sub of ["inbox", "weekly", "monthly", "papers", "cache"]) {
      await writer.ensureFolder(`${root}/${sub}`);
    }
  }

  private initLinker(): void {
    this.linker = new VaultLinker(
      this.app,
      this.settings.vaultLinking.excludeFolders,
      this.settings.vaultLinking.maxLinksPerPaper
    );
    // Build index in background — don't block plugin load
    if (this.settings.vaultLinking.enabled) {
      this.linker.buildIndex().catch(err =>
        console.warn("[PaperDaily] Vault index build failed:", err)
      );
    }
  }

  async rebuildLinkingIndex(): Promise<void> {
    this.linker = new VaultLinker(
      this.app,
      this.settings.vaultLinking.excludeFolders,
      this.settings.vaultLinking.maxLinksPerPaper
    );
    await this.linker.buildIndex();
  }

  private initScheduler(): void {
    this.scheduler = new Scheduler(
      () => this.settings,
      this.stateStore,
      {
        onDaily: () => this.runDaily(),
        onWeekly: () => this.runWeekly(),
        onMonthly: () => this.runMonthly()
      }
    );
    this.scheduler.start();
  }

  private registerCommands(): void {
    this.addCommand({
      id: "run-daily-now",
      name: "Run daily fetch & summarize now",
      callback: async () => {
        new Notice("Paper Daily: Running daily fetch...");
        try {
          await this.runDaily();
          new Notice("Paper Daily: Daily digest complete.");
        } catch (err) {
          new Notice(`Paper Daily Error: ${String(err)}`);
        }
      }
    });

    this.addCommand({
      id: "backfill",
      name: "Backfill daily summaries for date range",
      callback: () => {
        new BackfillModal(this.app, this).open();
      }
    });

    this.addCommand({
      id: "run-weekly-now",
      name: "Generate weekly report now",
      callback: async () => {
        new Notice("Paper Daily: Generating weekly report...");
        try {
          await this.runWeekly();
          new Notice("Paper Daily: Weekly report complete.");
        } catch (err) {
          new Notice(`Paper Daily Error: ${String(err)}`);
        }
      }
    });

    this.addCommand({
      id: "run-monthly-now",
      name: "Generate monthly report now",
      callback: async () => {
        new Notice("Paper Daily: Generating monthly report...");
        try {
          await this.runMonthly();
          new Notice("Paper Daily: Monthly report complete.");
        } catch (err) {
          new Notice(`Paper Daily Error: ${String(err)}`);
        }
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

  async runDaily(): Promise<void> {
    await runDailyPipeline(
      this.app,
      this.settings,
      this.stateStore,
      this.dedupStore,
      this.snapshotStore,
      { linker: this.settings.vaultLinking?.enabled ? this.linker : undefined }
    );
  }

  async runWeekly(): Promise<void> {
    await runWeeklyPipeline(
      this.app,
      this.settings,
      this.stateStore,
      this.snapshotStore
    );
  }

  async runMonthly(): Promise<void> {
    await runMonthlyPipeline(
      this.app,
      this.settings,
      this.stateStore,
      this.snapshotStore
    );
  }

  async runBackfill(startDate: string, endDate: string, onProgress: (msg: string) => void): Promise<void> {
    const result = await runBackfillPipeline(
      this.app,
      this.settings,
      this.stateStore,
      this.dedupStore,
      this.snapshotStore,
      {
        startDate,
        endDate,
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

  async testFetch(): Promise<{ url: string; total: number; firstTitle: string; error?: string }> {
    const source = new ArxivSource();
    const now = new Date();
    const params = {
      categories: this.settings.categories,
      keywords: this.settings.keywords,
      maxResults: this.settings.maxResultsPerDay,
      sortBy: this.settings.sortBy,
      windowStart: new Date(now.getTime() - 72 * 3600 * 1000),
      windowEnd: now
    };
    const url = source.buildUrl(params, params.maxResults * 3);
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
  private startDate = "";
  private endDate = "";
  private statusEl!: HTMLElement;

  constructor(app: App, plugin: PaperDailyPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Backfill Daily Summaries" });

    new Setting(contentEl)
      .setName("Start Date")
      .setDesc("YYYY-MM-DD")
      .addText(text => text
        .setPlaceholder("2026-02-01")
        .onChange(v => { this.startDate = v; }));

    new Setting(contentEl)
      .setName("End Date")
      .setDesc("YYYY-MM-DD")
      .addText(text => text
        .setPlaceholder("2026-02-28")
        .onChange(v => { this.endDate = v; }));

    this.statusEl = contentEl.createEl("p", { text: "", cls: "paper-daily-backfill-status" });

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText("Run Backfill")
        .setCta()
        .onClick(async () => {
          if (!this.startDate || !this.endDate) {
            this.statusEl.setText("Please enter both start and end dates.");
            return;
          }
          this.statusEl.setText("Starting backfill...");
          try {
            await this.plugin.runBackfill(
              this.startDate,
              this.endDate,
              (msg) => { this.statusEl.setText(msg); }
            );
          } catch (err) {
            this.statusEl.setText(`Error: ${String(err)}`);
          }
        }))
      .addButton(btn => btn
        .setButtonText("Close")
        .onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
