import type { Paper } from "../types/paper";
import type { InterestKeyword } from "../types/config";
import { computeInterestHits, computeWeightedInterestScore } from "./interest";

export function rankPapers(
  papers: Paper[],
  interestKeywords: InterestKeyword[]
): Paper[] {
  const scored = papers.map(paper => {
    const interestHits = computeInterestHits(paper, interestKeywords);
    const interestScore = computeWeightedInterestScore(paper, interestKeywords);

    // Ranking priority (descending importance):
    //   ① HuggingFace community upvotes  — log scale
    //   ② Weighted interest score         — user keywords × configured weight
    //   ③ Recency                         — tiebreaker only
    const hfScore = Math.log1p(paper.hfUpvotes ?? 0) * 10;
    const rankScore = hfScore + interestScore;

    return {
      ...paper,
      interestHits,
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
