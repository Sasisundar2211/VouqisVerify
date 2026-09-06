// Domain types for Vouqis Verify. Kept free of any React/UI or GitHub-API
// concerns so the classifier, evidence engine, and CSV export can be unit
// tested in isolation.

export type Category =
  | "PROMPT"
  | "MODEL_CONFIGURATION"
  | "RETRIEVAL_ACCESS"
  | "TOOL_PERMISSION"
  | "NONE"
  | "NEEDS_HUMAN_REVIEW";

export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

/**
 * Live evidence-retrieval outcome for one merged PR's checks/commit statuses.
 * Never conflate "no evidence found" or "could not retrieve evidence" with
 * a passing result — those are always distinct states.
 */
export type EvidenceStatus =
  | "CHECKS_PASSED"
  | "CHECKS_FAILED"
  | "NO_CHECKS_FOUND"
  | "EVIDENCE_RETRIEVAL_FAILED"
  | "NEEDS_HUMAN_REVIEW";

export interface EvidenceEvaluation {
  status: EvidenceStatus;
  /** Human-readable summary, e.g. "2 passed, 1 failed, 0 pending". */
  summary: string;
  checkNames: string[];
}

/** One GitHub Checks API run, normalized for display in the Verification Detail sheet. */
export interface CheckRunRecord {
  name: string;
  status: string;
  conclusion: string | null;
  url: string | null;
  /** ISO 8601 datetime the check completed (or started, if still running). */
  recordedAt: string | null;
}

/** One legacy commit status, normalized for display in the Verification Detail sheet. */
export interface CommitStatusRecord {
  name: string;
  state: string;
  url: string | null;
  /** ISO 8601 datetime the status was recorded. */
  recordedAt: string | null;
}

/** One PR review, normalized for display in the Verification Detail sheet. */
export interface ReviewRecord {
  reviewer: string;
  state: string;
  /** ISO 8601 datetime the review was submitted. */
  recordedAt: string | null;
}

/** A merged pull request, as imported from GitHub. */
export interface PullRequest {
  number: number;
  title: string;
  body: string;
  url: string;
  author: string;
  /** ISO 8601 date (YYYY-MM-DD) the PR was merged. */
  mergedAt: string;
  changedFiles: string[];
}

export interface Classification {
  category: Category;
  confidence: Confidence;
  reason: string;
}

export interface ClassifiedPullRequest extends PullRequest {
  classification: Classification;
  evidence: EvidenceEvaluation;
  /** Empty when evidence retrieval failed or no checks were found. */
  checkRuns: CheckRunRecord[];
  commitStatuses: CommitStatusRecord[];
  /** Empty when no reviews have been submitted (or evidence retrieval failed). */
  reviews: ReviewRecord[];
}

export const AI_CATEGORIES: readonly Category[] = [
  "PROMPT",
  "MODEL_CONFIGURATION",
  "RETRIEVAL_ACCESS",
  "TOOL_PERMISSION",
];

export const CATEGORY_LABELS: Record<Category, string> = {
  PROMPT: "Prompt",
  MODEL_CONFIGURATION: "Model Configuration",
  RETRIEVAL_ACCESS: "Retrieval / Access",
  TOOL_PERMISSION: "Tool / Permission",
  NONE: "Not AI-Related",
  NEEDS_HUMAN_REVIEW: "Classification Needs Review",
};

/** A PR is treated as AI-sensitive unless it was conclusively cleared as NONE. */
export function isAiSensitive(category: Category): boolean {
  return category !== "NONE";
}
