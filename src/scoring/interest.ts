import type { Paper } from "../types/paper";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function computeInterestHits(paper: Paper, keywords: string[]): string[] {
  const haystack = normalize(`${paper.title} ${paper.abstract}`);
  const hits: string[] = [];
  for (const kw of keywords) {
    if (haystack.includes(normalize(kw))) {
      hits.push(kw);
    }
  }
  return hits;
}
