import type { Paper } from "../types/paper";
import type { InterestKeyword } from "../types/config";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function computeInterestHits(paper: Paper, keywords: InterestKeyword[]): string[] {
  const haystack = normalize(`${paper.title} ${paper.abstract}`);
  return keywords
    .filter(kw => haystack.includes(normalize(kw.keyword)))
    .map(kw => kw.keyword);
}

export function computeWeightedInterestScore(paper: Paper, keywords: InterestKeyword[]): number {
  const haystack = normalize(`${paper.title} ${paper.abstract}`);
  return keywords
    .filter(kw => haystack.includes(normalize(kw.keyword)))
    .reduce((sum, kw) => sum + kw.weight, 0);
}
