// Date-range validation and summary-card aggregation over classified PRs.
// Pure functions, no UI/React or GitHub-API concerns.
//
// Note: date-range *filtering* itself now happens server-side, as part of
// the GitHub search query (see src/lib/github/pulls.ts) — the range the
// user picks IS the query, so there is no further client-side post-filter.

import { AI_CATEGORIES, type Category, type ClassifiedPullRequest, type EvidenceStatus } from "./types";

export interface DateRange {
  /** Inclusive, ISO date (YYYY-MM-DD). */
  from: string;
  /** Inclusive, ISO date (YYYY-MM-DD). */
  to: string;
}

export function isValidDateRange(range: DateRange): boolean {
  return range.from <= range.to;
}

export interface Summary {
  totalPRs: number;
  aiSensitivePRs: number;
  manualReviewPRs: number;
  categoryTotals: Record<Category, number>;
  evidenceStatusTotals: Record<EvidenceStatus, number>;
}

export const ZERO_SUMMARY: Summary = {
  totalPRs: 0,
  aiSensitivePRs: 0,
  manualReviewPRs: 0,
  categoryTotals: {
    PROMPT: 0,
    MODEL_CONFIGURATION: 0,
    RETRIEVAL_ACCESS: 0,
    TOOL_PERMISSION: 0,
    NONE: 0,
    NEEDS_HUMAN_REVIEW: 0,
  },
  evidenceStatusTotals: {
    CHECKS_PASSED: 0,
    CHECKS_FAILED: 0,
    NO_CHECKS_FOUND: 0,
    EVIDENCE_RETRIEVAL_FAILED: 0,
    NEEDS_HUMAN_REVIEW: 0,
  },
};

export function summarize(pullRequests: ClassifiedPullRequest[]): Summary {
  const categoryTotals = { ...ZERO_SUMMARY.categoryTotals };
  const evidenceStatusTotals = { ...ZERO_SUMMARY.evidenceStatusTotals };

  for (const pr of pullRequests) {
    categoryTotals[pr.classification.category] += 1;
    evidenceStatusTotals[pr.evidence.status] += 1;
  }

  const aiSensitivePRs = (AI_CATEGORIES as Category[]).reduce(
    (sum, category) => sum + categoryTotals[category],
    0,
  );

  return {
    totalPRs: pullRequests.length,
    aiSensitivePRs,
    manualReviewPRs: categoryTotals.NEEDS_HUMAN_REVIEW,
    categoryTotals,
    evidenceStatusTotals,
  };
}

/** The message shown in place of the results table when there are no rows. */
export function getResultsEmptyMessage(hasGenerated: boolean): string {
  return hasGenerated
    ? "No merged pull requests found in this date range."
    : "Connect a GitHub repository to generate an AI Change Evidence Pack.";
}
