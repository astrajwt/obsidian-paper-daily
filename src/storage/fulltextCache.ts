import type { App } from "obsidian";
import { TFile, TFolder, normalizePath } from "obsidian";
import type { VaultWriter } from "./vaultWriter";

export class FulltextCache {
  private readonly dir: string;

  constructor(
    private writer: VaultWriter,
    private app: App,
    rootFolder: string
  ) {
    this.dir = `${rootFolder}/cache/fulltext`;
  }

  private keyToPath(baseId: string): string {
    return `${this.dir}/${baseId}.md`;
  }

  async get(baseId: string): Promise<string | null> {
    return await this.writer.readNote(this.keyToPath(baseId));
  }

  async set(baseId: string, text: string): Promise<void> {
    await this.writer.writeNote(this.keyToPath(baseId), text);
  }

  /** Delete cache files not modified within ttlDays. Returns count deleted. */
  async prune(ttlDays: number): Promise<number> {
    const cutoff = Date.now() - ttlDays * 86400 * 1000;
    let deleted = 0;
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.dir));
    if (!(folder instanceof TFolder)) return 0;
    for (const child of [...folder.children]) {
      if (child instanceof TFile && child.stat.mtime < cutoff) {
        await this.app.vault.delete(child);
        deleted++;
      }
    }
    return deleted;
  }
}
