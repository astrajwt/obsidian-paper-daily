import type { Paper } from "../types/paper";
import type { DirectionConfig } from "../types/config";
import { computeInterestHits } from "./interest";
import { computeDirectionScores, getTopDirections } from "./directions";

export function rankPapers(
  papers: Paper[],
  interestKeywords: string[],
  directions: DirectionConfig[],
  directionTopK: number
): Paper[] {
  // Compute scores for all papers
  const scored = papers.map(paper => {
    const interestHits = computeInterestHits(paper, interestKeywords);
    const directionScores = computeDirectionScores(paper, directions);
    const topDirections = getTopDirections(directionScores, directionTopK);

    const totalDirectionScore = Object.values(directionScores).reduce((a, b) => a + b, 0);
    const interestScore = interestHits.length;

    return {
      ...paper,
      interestHits,
      directionScores,
      topDirections,
      _rankScore: totalDirectionScore * 2 + interestScore
    };
  });

  // Sort: primary by rankScore, secondary by updated/published (most recent first)
  scored.sort((a, b) => {
    if (b._rankScore !== a._rankScore) return b._rankScore - a._rankScore;
    const dateA = new Date(a.updated || a.published).getTime();
    const dateB = new Date(b.updated || b.published).getTime();
    return dateB - dateA;
  });

  // Remove internal _rankScore before returning
  return scored.map(({ _rankScore: _r, ...paper }) => paper as Paper);
}
