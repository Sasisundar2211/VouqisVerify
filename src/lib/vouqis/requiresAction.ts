// Determines whether a classified PR needs a human to act on it before the
// evidence pack can be treated as complete. Pure function of the PR's own
// evidence status + classification confidence — no I/O.

import type { ClassifiedPullRequest } from "./types";

export interface RequiresActionResult {
  requiresAction: boolean;
  /** Explicit label for the "Requires Action" column, e.g. "YES — checks failed". */
  label: string;
}

export function computeRequiresAction(pr: ClassifiedPullRequest): RequiresActionResult {
  const { evidence, classification } = pr;
  const classificationNeedsReview = classification.category === "NEEDS_HUMAN_REVIEW";
  const verificationEvidenceNeedsReview = evidence.status === "NEEDS_HUMAN_REVIEW";

  if (classificationNeedsReview && verificationEvidenceNeedsReview) {
    return {
      requiresAction: true,
      label: "YES — classification and verification evidence review required",
    };
  }

  switch (evidence.status) {
    case "CHECKS_FAILED":
      return { requiresAction: true, label: "YES — checks failed" };
    case "NO_CHECKS_FOUND":
      return { requiresAction: true, label: "YES — no checks found" };
    case "EVIDENCE_RETRIEVAL_FAILED":
      return { requiresAction: true, label: "YES — evidence retrieval failed" };
    case "NEEDS_HUMAN_REVIEW":
      return { requiresAction: true, label: "YES — verification evidence review required" };
    case "CHECKS_PASSED":
      if (classificationNeedsReview) {
        return { requiresAction: true, label: "YES — classification review required" };
      }
      if (
        classification.category === "NONE" ||
        classification.confidence === "HIGH" ||
        classification.confidence === "MEDIUM"
      ) {
        return { requiresAction: false, label: "NO" };
      }
      return { requiresAction: true, label: "YES — review required" };
    default:
      return { requiresAction: true, label: "YES — evidence missing" };
  }
}
