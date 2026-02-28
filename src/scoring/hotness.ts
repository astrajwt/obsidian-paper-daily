import type { Paper } from "../types/paper";

export interface HotnessScore {
  score: number;
  reasons: string[];
}

function extractVersion(paperId: string): number {
  const m = paperId.match(/v(\d+)$/i);
  return m ? parseInt(m[1], 10) : 1;
}

function hoursSincePublished(paper: Paper): number {
  const dateStr = paper.published || paper.updated;
  if (!dateStr) return 9999;
  const d = new Date(dateStr);
  return (Date.now() - d.getTime()) / (1000 * 3600);
}

export function computeHotness(paper: Paper): HotnessScore {
  let score = 0;
  const reasons: string[] = [];

  // ── Version bonus: v2=+1, v3=+2, v4+=+3 ─────────────────────
  const version = extractVersion(paper.id);
  if (version >= 4) {
    score += 3;
    reasons.push(`v${version} (heavily revised)`);
  } else if (version === 3) {
    score += 2;
    reasons.push(`v${version} (revised twice)`);
  } else if (version === 2) {
    score += 1;
    reasons.push(`v${version} (revised once)`);
  }

  // ── Cross-listing bonus: multiple categories ──────────────────
  const uniqueCats = new Set(paper.categories).size;
  if (uniqueCats >= 4) {
    score += 3;
    reasons.push(`${uniqueCats} categories (broad impact)`);
  } else if (uniqueCats === 3) {
    score += 2;
    reasons.push(`${uniqueCats} categories`);
  } else if (uniqueCats === 2) {
    score += 1;
    reasons.push(`${uniqueCats} categories`);
  }

  // ── Recency bonus ─────────────────────────────────────────────
  const hours = hoursSincePublished(paper);
  if (hours <= 24) {
    score += 3;
    reasons.push("published <24h ago");
  } else if (hours <= 48) {
    score += 2;
    reasons.push("published <48h ago");
  } else if (hours <= 72) {
    score += 1;
    reasons.push("published <72h ago");
  }

  // ── HuggingFace upvotes ───────────────────────────────────────
  const upvotes = paper.hfUpvotes ?? 0;
  if (upvotes >= 21) {
    score += 3;
    reasons.push(`${upvotes} HF upvotes`);
  } else if (upvotes >= 6) {
    score += 2;
    reasons.push(`${upvotes} HF upvotes`);
  } else if (upvotes >= 1) {
    score += 1;
    reasons.push(`${upvotes} HF upvotes`);
  }

  return { score, reasons };
}
