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
  const scored = papers.map(paper => {
    const interestHits = computeInterestHits(paper, interestKeywords);
    const directionScores = computeDirectionScores(paper, directions);
    const topDirections = getTopDirections(directionScores, directionTopK);

    const totalDirectionScore = Object.values(directionScores).reduce((a, b) => a + b, 0);
    const interestScore = interestHits.length;

    // Ranking priority (descending importance):
    //   ① HuggingFace community upvotes  — log scale so 1 upvote > nothing,
    //                                       but 100 upvotes doesn't fully eclipse relevance
    //   ② Direction relevance score       — keyword matches × direction weight
    //   ③ Interest keyword hits           — explicit user interest
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
