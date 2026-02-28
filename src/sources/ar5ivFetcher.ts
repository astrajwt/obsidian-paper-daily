import { requestUrl } from "obsidian";

/**
 * Fetch full text for an arXiv paper from ar5iv (HTML rendering of arXiv papers).
 * Returns plain text truncated to maxChars, or null on failure.
 * baseId should be the bare arXiv ID without version, e.g. "2501.12345".
 */
export async function fetchArxivFullText(baseId: string, maxChars: number): Promise<string | null> {
  const url = `https://ar5iv.labs.arxiv.org/html/${baseId}`;
  try {
    const resp = await requestUrl({ url, method: "GET" });
    if (resp.status !== 200) return null;
    return extractText(resp.text, maxChars);
  } catch {
    return null;
  }
}

function extractText(html: string, maxChars: number): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Strip noisy / non-content elements
  for (const sel of [
    "math", "figure", "figcaption",
    ".ltx_bibliography", ".ltx_page_footer",
    "nav", "header", "script", "style", "svg"
  ]) {
    doc.querySelectorAll(sel).forEach(el => el.remove());
  }

  // Prefer <article> (ar5iv wraps content there), fall back to <body>
  const root = doc.querySelector("article") ?? doc.body;
  const raw = (root.textContent ?? "").replace(/\s+/g, " ").trim();
  return raw.slice(0, maxChars);
}
