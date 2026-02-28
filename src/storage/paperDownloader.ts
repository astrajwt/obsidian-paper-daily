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

// ── HTML → Markdown converter ──────────────────────────────────
// Handles arXiv HTML papers (LaTeXML / ar5iv format).
// Math is extracted from alttext attribute on <math> tags.

function convertNode(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (text) out.push(text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  // Skip entirely
  if (["script", "style", "nav", "noscript", "button", "svg", "img"].includes(tag)) return;
  if (el.classList.contains("ltx_navigation") ||
      el.classList.contains("ltx_page_header") ||
      el.classList.contains("ltx_page_footer")) return;

  // Math: prefer alttext (LaTeX source)
  if (tag === "math") {
    const alttext = el.getAttribute("alttext") ?? el.textContent ?? "";
    const isBlock = el.getAttribute("display") === "block";
    out.push(isBlock ? `\n\n$$${alttext}$$\n\n` : `$${alttext}$`);
    return;
  }

  const children = () => {
    const buf: string[] = [];
    Array.from(el.childNodes).forEach(child => convertNode(child, buf));
    return buf.join("");
  };

  const headings: Record<string, string> = {
    h1: "#", h2: "##", h3: "###", h4: "####", h5: "#####", h6: "######"
  };

  if (headings[tag]) {
    out.push(`\n\n${headings[tag]} ${children().trim()}\n\n`);
    return;
  }

  switch (tag) {
    case "p":
      out.push(`\n\n${children().trim()}\n\n`);
      return;
    case "br":
      out.push("\n");
      return;
    case "li":
      out.push(`\n- ${children().trim()}`);
      return;
    case "ul": case "ol":
      out.push(`\n${children()}\n`);
      return;
    case "code":
      out.push(`\`${children()}\``);
      return;
    case "pre":
      out.push(`\n\n\`\`\`\n${children()}\n\`\`\`\n\n`);
      return;
    case "strong": case "b":
      out.push(`**${children()}**`);
      return;
    case "em": case "i":
      out.push(`*${children()}*`);
      return;
    case "blockquote":
      out.push(`\n\n> ${children().trim().replace(/\n/g, "\n> ")}\n\n`);
      return;
    case "hr":
      out.push("\n\n---\n\n");
      return;
    case "figure": {
      // Keep caption, skip image data
      const cap = el.querySelector("figcaption");
      if (cap) out.push(`\n\n> *${cap.textContent?.trim()}*\n\n`);
      return;
    }
    case "a": {
      const href = el.getAttribute("href") ?? "";
      const text = children().trim();
      // Skip footnote / citation anchors (#xxx)
      out.push(href && !href.startsWith("#") ? `[${text}](${href})` : text);
      return;
    }
    case "table": {
      out.push("\n\n");
      Array.from(el.querySelectorAll("tr")).forEach(row => {
        const cells = Array.from(row.querySelectorAll("th, td"))
          .map((c: Element) => c.textContent?.trim() ?? "");
        out.push(`| ${cells.join(" | ")} |\n`);
      });
      out.push("\n");
      return;
    }
    default:
      Array.from(el.childNodes).forEach(child => convertNode(child, out));
  }
}

function htmlToMarkdown(html: string, paper: Paper): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Find main content
  const root =
    doc.querySelector("article") ??
    doc.querySelector(".ltx_document") ??
    doc.querySelector("main") ??
    doc.body;

  const buf: string[] = [];
  Array.from(root.childNodes).forEach(child => convertNode(child, buf));

  const body = buf.join("")
    .replace(/\n{3,}/g, "\n\n")   // collapse 3+ blank lines
    .trim();

  // Prepend YAML frontmatter
  const arxivId = getArxivId(paper.id);
  const escapedTitle = paper.title.replace(/"/g, '\\"');
  const frontmatter = [
    "---",
    `title: "${escapedTitle}"`,
    `arxiv: ${arxivId}`,
    `authors: [${paper.authors.slice(0, 5).map(a => `"${a.replace(/"/g, '\\"')}"`).join(", ")}]`,
    `published: ${paper.published.slice(0, 10)}`,
    `categories: [${paper.categories.join(", ")}]`,
    `links:`,
    `  html: ${paper.links.html ?? ""}`,
    `  pdf: ${paper.links.pdf ?? ""}`,
    "source: arxiv-html",
    "---"
  ].join("\n");

  return `${frontmatter}\n\n${body}`;
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
  saveHtml: boolean,
  savePdf: boolean,
  log: (msg: string) => void
): Promise<void> {
  const arxivId = getArxivId(paper.id);
  const filename = safeFilename(arxivId);

  if (saveHtml) {
    const mdPath = normalizePath(`${rootFolder}/papers/html/${filename}.md`);
    if (app.vault.getAbstractFileByPath(mdPath)) {
      log(`HTML skip (exists): ${filename}`);
    } else {
      try {
        const url = `https://arxiv.org/html/${arxivId}`;
        const resp = await requestUrl({ url, method: "GET" });
        if (resp.status === 200) {
          const md = htmlToMarkdown(resp.text, paper);
          await ensureFolder(app, `${rootFolder}/papers/html`);
          await app.vault.create(mdPath, md);
          log(`HTML saved: ${filename}.md (${md.length} chars)`);
        } else {
          log(`HTML skip (HTTP ${resp.status}): ${filename}`);
        }
      } catch (err) {
        log(`HTML error: ${filename}: ${String(err)}`);
      }
      await sleep(1200);
    }
  }

  if (savePdf && paper.links.pdf) {
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
}

// ── Public entry point ─────────────────────────────────────────

export async function downloadPapersForDay(
  app: App,
  papers: Paper[],
  settings: PaperDailySettings,
  log: (msg: string) => void
): Promise<void> {
  const cfg = settings.paperDownload;
  if (!cfg?.enabled) return;
  if (!cfg.saveHtml && !cfg.savePdf) return;

  const topN = papers.slice(0, cfg.maxPapers ?? 5);
  log(`Step DOWNLOAD: ${topN.length} papers (saveHtml=${cfg.saveHtml} savePdf=${cfg.savePdf})`);

  for (const paper of topN) {
    await downloadOne(app, paper, settings.rootFolder, !!cfg.saveHtml, !!cfg.savePdf, log);
  }

  log(`Step DOWNLOAD: done`);
}
