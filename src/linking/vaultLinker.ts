import { App, TFile, TFolder } from "obsidian";
import type { Paper } from "../types/paper";

export interface NoteMatch {
  displayName: string;  // [[this]] wikilink text
  path: string;         // full vault path
  matchedOn: string[];  // which keywords triggered the match
}

interface IndexEntry {
  displayName: string;
  path: string;
  keywords: string[];   // all matchable terms for this note
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

// Extract individual words and common bigrams from a normalized string
function terms(s: string): string[] {
  const words = normalize(s).split(" ").filter(w => w.length > 2);
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]} ${words[i + 1]}`);
  }
  return [...words, ...bigrams];
}

export class VaultLinker {
  private index: IndexEntry[] = [];
  private built = false;

  constructor(
    private app: App,
    private excludeFolders: string[],
    private maxLinksPerPaper: number
  ) {}

  // Build index from vault. Scans folder names, file stems, and H1/H2 headings.
  async buildIndex(): Promise<void> {
    this.index = [];
    const vault = this.app.vault;
    const allFiles = vault.getMarkdownFiles();

    for (const file of allFiles) {
      // Skip excluded folders
      const topFolder = file.path.split("/")[0];
      if (this.excludeFolders.some(ex => ex.toLowerCase() === topFolder.toLowerCase())) {
        continue;
      }

      const keywords = new Set<string>();

      // From folder name(s) in path
      const parts = file.path.split("/");
      for (const part of parts.slice(0, -1)) {  // all folders in path
        for (const t of terms(part)) keywords.add(t);
      }

      // From file stem (filename without extension)
      const stem = file.basename;
      for (const t of terms(stem)) keywords.add(t);

      // From H1/H2 headings in content (read first 60 lines only for speed)
      try {
        const content = await vault.cachedRead(file);
        const lines = content.split("\n").slice(0, 60);
        for (const line of lines) {
          const heading = line.match(/^#{1,2}\s+(.+)/);
          if (heading) {
            for (const t of terms(heading[1])) keywords.add(t);
          }
        }
      } catch {
        // skip unreadable files
      }

      // displayName: prefer "folder/00_index" for index files, else "folder/filename"
      const isIndex = stem.match(/^0*[0-9]*_?index$/i) || stem === "00_index";
      const displayName = isIndex
        ? parts.slice(0, -1).join("/")   // just "vllm" for vllm/00_index.md
        : file.path.replace(/\.md$/, "");

      this.index.push({
        displayName,
        path: file.path,
        keywords: [...keywords]
      });
    }

    this.built = true;
  }

  findRelated(paper: Paper): NoteMatch[] {
    if (!this.built || this.index.length === 0) return [];

    const haystack = normalize(`${paper.title} ${paper.abstract} ${paper.categories.join(" ")}`);

    const scored: { entry: IndexEntry; hits: string[]; score: number }[] = [];

    for (const entry of this.index) {
      const hits: string[] = [];
      for (const kw of entry.keywords) {
        // Prefer whole-word matches for short keywords to reduce noise
        if (kw.length <= 3) {
          const re = new RegExp(`\\b${kw}\\b`);
          if (re.test(haystack)) hits.push(kw);
        } else {
          if (haystack.includes(kw)) hits.push(kw);
        }
      }
      if (hits.length > 0) {
        scored.push({ entry, hits, score: hits.length });
      }
    }

    // Sort by score descending, deduplicate by displayName (keep highest score)
    scored.sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    const results: NoteMatch[] = [];
    for (const { entry, hits } of scored) {
      if (seen.has(entry.displayName)) continue;
      seen.add(entry.displayName);
      results.push({ displayName: entry.displayName, path: entry.path, matchedOn: hits.slice(0, 5) });
      if (results.length >= this.maxLinksPerPaper) break;
    }
    return results;
  }

  isBuilt(): boolean {
    return this.built;
  }

  // Rebuild index (call after vault changes)
  async rebuild(): Promise<void> {
    this.built = false;
    await this.buildIndex();
  }
}
