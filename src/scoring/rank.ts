import type { Paper } from "../types/paper";
import type { DirectionConfig, InterestKeyword } from "../types/config";
import { computeInterestHits, computeWeightedInterestScore } from "./interest";
import { computeDirectionScores, getTopDirections } from "./directions";

export function rankPapers(
  papers: Paper[],
  interestKeywords: InterestKeyword[],
  directions: DirectionConfig[],
  directionTopK: number
): Paper[] {
  const scored = papers.map(paper => {
    const interestHits = computeInterestHits(paper, interestKeywords);
    const directionScores = computeDirectionScores(paper, directions);
    const topDirections = getTopDirections(directionScores, directionTopK);

    const totalDirectionScore = Object.values(directionScores).reduce((a, b) => a + b, 0);
    const interestScore = computeWeightedInterestScore(paper, interestKeywords);

    // Ranking priority (descending importance):
    //   ① HuggingFace community upvotes  — log scale
    //   ② Direction relevance score       — keyword matches × direction weight
    //   ③ Weighted interest score         — user keywords × configured weight
    //   ④ Recency                         — tiebreaker only
    const hfScore = Math.log1p(paper.hfUpvotes ?? 0) * 10;
    const rankScore = hfScore + totalDirectionScore * 2 + interestScore;

    return {
      ...paper,
      interestHits,
      directionScores,
      topDirections,
      _rankScore: rankScore
    };
  });

  scored.sort((a, b) => {
    if (Math.abs(b._rankScore - a._rankScore) > 0.001) return b._rankScore - a._rankScore;
    const dateA = new Date(a.updated || a.published).getTime();
    const dateB = new Date(b.updated || b.published).getTime();
    return dateB - dateA;
  });

  return scored.map(({ _rankScore: _r, ...paper }) => paper as Paper);
}
