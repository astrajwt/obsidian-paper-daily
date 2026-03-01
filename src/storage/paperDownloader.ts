import { App, normalizePath, requestUrl, TFile } from "obsidian";
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
  date: string,
  log: (msg: string) => void
): Promise<void> {
  const arxivId = getArxivId(paper.id);
  const filename = safeFilename(arxivId);

  if (!paper.links.pdf) return;
  const pdfFolder = `${rootFolder}/papers/pdf/${date}`;
  const pdfPath = normalizePath(`${pdfFolder}/${filename}.pdf`);

  if (app.vault.getAbstractFileByPath(pdfPath)) {
    paper.links.localPdf = pdfPath;
    log(`PDF skip (exists): ${filename}`);
  } else {
    try {
      const resp = await requestUrl({ url: paper.links.pdf, method: "GET" });
      if (resp.status === 200) {
        await ensureFolder(app, pdfFolder);
        await app.vault.adapter.writeBinary(pdfPath, resp.arrayBuffer);
        paper.links.localPdf = pdfPath;
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

export async function downloadPapersForDay(
  app: App,
  papers: Paper[],
  settings: PaperDailySettings,
  log: (msg: string) => void,
  date: string
): Promise<void> {
  if (!settings.paperDownload?.savePdf) return;

  log(`Step DOWNLOAD: ${papers.length} papers → papers/pdf/${date}/`);
  for (const paper of papers) {
    await downloadOne(app, paper, settings.rootFolder, date, log);
  }
  log(`Step DOWNLOAD: done`);
}

/**
 * Read a downloaded PDF from the vault and return it as a base64 string.
 * Returns null if the file does not exist or cannot be read.
 * Used to pass PDF content directly to LLM providers that support it (e.g. Anthropic).
 */
export async function readPaperPdfAsBase64(
  app: App,
  rootFolder: string,
  paperId: string,
  date: string
): Promise<string | null> {
  const arxivId = paperId.replace(/^arxiv:/i, "");
  const filename = arxivId.replace(/[/\\:*?"<>|]/g, "_");
  const pdfPath = normalizePath(`${rootFolder}/papers/pdf/${date}/${filename}.pdf`);
  const abstractFile = app.vault.getAbstractFileByPath(pdfPath);
  if (!(abstractFile instanceof TFile)) return null;
  try {
    const buffer = await app.vault.readBinary(abstractFile);
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary);
  } catch {
    return null;
  }
}
