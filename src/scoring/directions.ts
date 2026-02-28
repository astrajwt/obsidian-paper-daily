import type { Paper } from "../types/paper";
import type { DirectionConfig } from "../types/config";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function computeDirectionScores(
  paper: Paper,
  directions: DirectionConfig[]
): Record<string, number> {
  const haystack = normalize(`${paper.title} ${paper.abstract}`);
  const scores: Record<string, number> = {};

  for (const dir of directions) {
    let score = 0;
    for (const kw of dir.match.keywords) {
      if (haystack.includes(normalize(kw))) {
        score += 1;
      }
    }
    // Category bonus
    if (dir.match.categories && dir.match.categories.length > 0) {
      const hasCategory = paper.categories.some(c =>
        dir.match.categories!.includes(c)
      );
      if (hasCategory && score > 0) {
        score += 0.5;
      }
    }
    if (score > 0) {
      scores[dir.name] = score * dir.weight;
    }
  }

  return scores;
}

export function getTopDirections(
  scores: Record<string, number>,
  topK: number
): string[] {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([name]) => name);
}

export function aggregateDirections(
  papers: Paper[]
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const paper of papers) {
    if (!paper.directionScores) continue;
    for (const [dir, score] of Object.entries(paper.directionScores)) {
      totals[dir] = (totals[dir] ?? 0) + score;
    }
  }
  return totals;
}
