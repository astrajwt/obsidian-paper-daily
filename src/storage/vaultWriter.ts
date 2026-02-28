import { App, normalizePath, TFile, TFolder } from "obsidian";

export class VaultWriter {
  constructor(private app: App) {}

  async ensureFolder(folderPath: string): Promise<void> {
    const normalized = normalizePath(folderPath);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (!existing) {
      await this.app.vault.createFolder(normalized);
    }
  }

  async ensureFolderForFile(filePath: string): Promise<void> {
    const parts = normalizePath(filePath).split("/");
    parts.pop(); // remove filename
    if (parts.length > 0) {
      await this.ensureFolder(parts.join("/"));
    }
  }

  async writeNote(filePath: string, content: string): Promise<void> {
    const normalized = normalizePath(filePath);
    await this.ensureFolderForFile(normalized);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(normalized, content);
    }
  }

  async readNote(filePath: string): Promise<string | null> {
    const normalized = normalizePath(filePath);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (file instanceof TFile) {
      return await this.app.vault.read(file);
    }
    return null;
  }

  async appendToNote(filePath: string, content: string): Promise<void> {
    const normalized = normalizePath(filePath);
    await this.ensureFolderForFile(normalized);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      const current = await this.app.vault.read(existing);
      await this.app.vault.modify(existing, current + content);
    } else {
      await this.app.vault.create(normalized, content);
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    const normalized = normalizePath(filePath);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    return file instanceof TFile;
  }

  async listFolder(folderPath: string): Promise<string[]> {
    const normalized = normalizePath(folderPath);
    const folder = this.app.vault.getAbstractFileByPath(normalized);
    if (folder instanceof TFolder) {
      return folder.children
        .filter(f => f instanceof TFile)
        .map(f => f.name);
    }
    return [];
  }
}
