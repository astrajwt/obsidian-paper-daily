import { requestUrl } from "obsidian";
import type { Paper, FetchParams } from "../types/paper";
import type { PaperSource } from "./source";

export class ArxivSource implements PaperSource {
  name = "arxiv";
  enabled = true;

  buildQuery(categories: string[], keywords: string[]): string {
    const catParts = categories.map(c => `cat:${c}`);
    const catClause = catParts.length > 0 ? `(${catParts.join(" OR ")})` : "";

    if (keywords.length === 0) {
      return catClause || "all:*";
    }

    const kwParts = keywords.map(k => `all:"${k}"`);
    const kwClause = `(${kwParts.join(" OR ")})`;

    return catClause ? `(${catClause}) AND ${kwClause}` : kwClause;
  }

  buildUrl(params: FetchParams, maxResults: number): string {
    const query = this.buildQuery(params.categories, params.keywords);
    const encoded = encodeURIComponent(query);
    const sortOrder = "descending";
    return `https://export.arxiv.org/api/query?search_query=${encoded}&max_results=${maxResults}&sortBy=${params.sortBy}&sortOrder=${sortOrder}`;
  }

  parseAtomEntry(entry: Element): Paper | null {
    const getText = (tag: string): string => {
      const el = entry.querySelector(tag);
      return el ? el.textContent?.trim() ?? "" : "";
    };

    const rawId = getText("id");
    if (!rawId) return null;

    // Extract arXiv ID from URL like http://arxiv.org/abs/2501.12345v2
    const arxivIdMatch = rawId.match(/arxiv\.org\/abs\/([^v]+)(v\d+)?/i);
    const arxivId = arxivIdMatch
      ? `arxiv:${arxivIdMatch[1]}${arxivIdMatch[2] ?? ""}`.toLowerCase()
      : `arxiv:${rawId}`;

    const title = getText("title").replace(/\s+/g, " ");
    const abstract = getText("summary").replace(/\s+/g, " ");
    const published = getText("published");
    const updated = getText("updated");

    const authors: string[] = [];
    entry.querySelectorAll("author name").forEach(el => {
      const name = el.textContent?.trim();
      if (name) authors.push(name);
    });

    const categories: string[] = [];
    entry.querySelectorAll("category").forEach(el => {
      const term = el.getAttribute("term");
      if (term) categories.push(term);
    });

    let htmlLink = "";
    let pdfLink = "";
    entry.querySelectorAll("link").forEach(el => {
      const rel = el.getAttribute("rel");
      const href = el.getAttribute("href") ?? "";
      const type = el.getAttribute("type") ?? "";
      if (rel === "alternate" || type === "text/html") htmlLink = href;
      if (type === "application/pdf" || href.includes("/pdf/")) pdfLink = href;
    });

    return {
      id: arxivId,
      title,
      abstract,
      authors,
      categories,
      published,
      updated,
      links: { html: htmlLink || undefined, pdf: pdfLink || undefined },
      source: "arxiv"
    };
  }

  filterByWindow(papers: Paper[], windowStart: Date, windowEnd: Date): Paper[] {
    return papers.filter(p => {
      // Use published date for filtering — more stable than updated.
      // updated can be a revision date from long ago; published reflects
      // when arXiv first made the paper available.
      const dateStr = p.published || p.updated;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d >= windowStart && d <= windowEnd;
    });
  }

  async fetch(params: FetchParams): Promise<Paper[]> {
    const maxResults = params.maxResults * 3;
    const url = this.buildUrl(params, maxResults);

    // Retry with exponential backoff on 429 (arXiv rate limit)
    const delays = [5000, 15000, 30000];
    let lastErr: unknown;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      if (attempt > 0) {
        const wait = delays[attempt - 1];
        console.log(`[PaperDaily] arXiv 429, retrying in ${wait / 1000}s (attempt ${attempt}/${delays.length})...`);
        await new Promise(r => setTimeout(r, wait));
      }
      try {
        const response = await requestUrl({ url, method: "GET" });
        const xmlText = response.text;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, "application/xml");

        const parseError = doc.querySelector("parsererror");
        if (parseError) {
          throw new Error(`arXiv XML parse error: ${parseError.textContent}`);
        }

        const entries = Array.from(doc.querySelectorAll("entry"));
        const papers: Paper[] = [];
        for (const entry of entries) {
          const paper = this.parseAtomEntry(entry);
          if (paper) papers.push(paper);
        }

        // Filter to the requested time window so dedup only marks genuinely
        // new papers as seen. Without this, every run marks the same rolling
        // batch of results as seen and subsequent runs show nothing.
        return this.filterByWindow(papers, params.windowStart, params.windowEnd);
      } catch (err) {
        const msg = String(err);
        if (msg.includes("429") && attempt < delays.length) {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }
}
