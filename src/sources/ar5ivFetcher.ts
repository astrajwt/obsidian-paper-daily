import { requestUrl } from "obsidian";

/**
 * Fetch full text for an arXiv paper.
 * Tries arxiv.org/html first (official), then ar5iv as fallback.
 * Returns plain text truncated to maxChars, or null on failure.
 * baseId: bare arXiv ID without version, e.g. "2501.12345".
 */
export async function fetchArxivFullText(baseId: string, maxChars: number): Promise<string | null> {
  const urls = [
    `https://arxiv.org/html/${baseId}`,
    `https://ar5iv.labs.arxiv.org/html/${baseId}`,
  ];
  for (const url of urls) {
    try {
      const resp = await requestUrl({ url, method: "GET" });
      if (resp.status === 200 && resp.text.length > 500) {
        return extractText(resp.text, maxChars);
      }
    } catch {
      // try next
    }
  }
  return null;
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

  // Prefer <article> (ar5iv / arxiv HTML wraps content there), fall back to <body>
  const root = doc.querySelector("article") ?? doc.body;
  const raw = (root.textContent ?? "").replace(/\s+/g, " ").trim();
  return raw.slice(0, maxChars);
}
