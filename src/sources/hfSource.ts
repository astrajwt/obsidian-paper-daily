import { requestUrl } from "obsidian";
import type { Paper, FetchParams } from "../types/paper";
import type { PaperSource } from "./source";

interface HFPaperEntry {
  paper: {
    id: string;            // arXiv ID, e.g. "2502.12345" (no version)
    title: string;
    summary?: string;      // abstract
    authors?: { name: string }[];
    publishedAt?: string;
    upvotes?: number;
  };
}

export class HFSource implements PaperSource {
  name = "huggingface";
  enabled = true;

  // Fetch HF daily papers for a given date (YYYY-MM-DD).
  // Returns Paper[] with hfUpvotes populated.
  async fetchForDate(date: string): Promise<Paper[]> {
    const url = `https://huggingface.co/api/daily_papers?date=${date}`;
    const response = await requestUrl({ url, method: "GET" });
    const entries: HFPaperEntry[] = JSON.parse(response.text);
    if (!Array.isArray(entries)) return [];

    const papers: Paper[] = [];
    for (const entry of entries) {
      const p = entry.paper;
      if (!p?.id) continue;

      const baseId = p.id.trim();  // e.g. "2502.12345"
      const authors = (p.authors ?? []).map(a => a.name).filter(Boolean);
      const published = p.publishedAt ?? "";
      const htmlLink = `https://arxiv.org/abs/${baseId}`;
      const pdfLink = `https://arxiv.org/pdf/${baseId}`;

      papers.push({
        id: `arxiv:${baseId}`,           // normalised without version so we can match
        title: p.title ?? "",
        abstract: p.summary ?? "",
        authors,
        categories: [],
        published,
        updated: published,
        links: { html: htmlLink, pdf: pdfLink },
        source: "hf",
        hfUpvotes: p.upvotes ?? 0
      });
    }

    // Sort by upvotes descending so highest-signal papers come first
    papers.sort((a, b) => (b.hfUpvotes ?? 0) - (a.hfUpvotes ?? 0));
    return papers;
  }

  // PaperSource interface: not used in normal pipeline (we call fetchForDate directly)
  async fetch(_params: FetchParams): Promise<Paper[]> {
    return [];
  }
}
