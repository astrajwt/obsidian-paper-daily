import { App, normalizePath, requestUrl } from "obsidian";
import type { Paper } from "../types/paper";
import type { PaperDailySettings } from "../types/config";

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getArxivId(paperId: string): string {
  return paperId.replace(/^arxiv:/i, "");  // "2501.12345v2"
}

function safeFilename(id: string): string {
  return id.replace(/[/\\:*?"<>|]/g, "_");
}

// ── Folder helpers ─────────────────────────────────────────────

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  if (!folderPath) return;
  const normalized = normalizePath(folderPath);
  if (app.vault.getAbstractFileByPath(normalized)) return;
  // Ensure parent first
  const parent = normalized.split("/").slice(0, -1).join("/");
  if (parent) await ensureFolder(app, parent);
  try { await app.vault.createFolder(normalized); } catch { /* already exists */ }
}

// ── Per-paper download ─────────────────────────────────────────

async function downloadOne(
  app: App,
  paper: Paper,
  rootFolder: string,
  log: (msg: string) => void
): Promise<void> {
  const arxivId = getArxivId(paper.id);
  const filename = safeFilename(arxivId);

  if (!paper.links.pdf) return;
  const pdfPath = normalizePath(`${rootFolder}/papers/pdf/${filename}.pdf`);
  if (app.vault.getAbstractFileByPath(pdfPath)) {
    log(`PDF skip (exists): ${filename}`);
  } else {
    try {
      const resp = await requestUrl({ url: paper.links.pdf, method: "GET" });
      if (resp.status === 200) {
        await ensureFolder(app, `${rootFolder}/papers/pdf`);
        await app.vault.adapter.writeBinary(pdfPath, resp.arrayBuffer);
        log(`PDF saved: ${filename}.pdf (${Math.round(resp.arrayBuffer.byteLength / 1024)} KB)`);
      } else {
        log(`PDF skip (HTTP ${resp.status}): ${filename}`);
      }
    } catch (err) {
      log(`PDF error: ${filename}: ${String(err)}`);
    }
    await sleep(1200);
  }
}

// ── Public entry point ─────────────────────────────────────────

export async function downloadPapersForDay(
  app: App,
  papers: Paper[],
  settings: PaperDailySettings,
  log: (msg: string) => void
): Promise<void> {
  if (!settings.paperDownload?.savePdf) return;

  log(`Step DOWNLOAD: ${papers.length} papers`);
  for (const paper of papers) {
    await downloadOne(app, paper, settings.rootFolder, log);
  }
  log(`Step DOWNLOAD: done`);
}
