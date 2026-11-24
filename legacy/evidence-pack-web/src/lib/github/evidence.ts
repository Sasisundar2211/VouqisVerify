// Combines the Checks API and legacy Commit Status API into one evidence
// verdict per PR. Kept pure (no network calls) so it's unit-testable: callers
// in pulls.ts do the fetching and try/catch, then hand results here.

import type { EvidenceEvaluation, EvidenceStatus } from "@/lib/vouqis/types";

export interface CheckRun {
  name: string;
  status: string; // "completed" | "in_progress" | "queued" | ...
  conclusion: string | null; // "success" | "failure" | "neutral" | "cancelled" | ... | null
}

export interface CommitStatus {
  context: string;
  state: string; // "success" | "failure" | "error" | "pending"
}

/**
 * Builds the verdict for a PR whose checks/statuses were fetched successfully
 * (possibly both empty). Never called on a failed fetch — see
 * buildRetrievalFailedEvidence for that case.
 */
export function evaluateEvidence(checkRuns: CheckRun[], statuses: CommitStatus[]): EvidenceEvaluation {
  const checkNames = [...checkRuns.map((c) => c.name), ...statuses.map((s) => s.context)];

  if (checkRuns.length === 0 && statuses.length === 0) {
    return { status: "NO_CHECKS_FOUND", summary: "No check runs or commit statuses were found for this PR.", checkNames };
  }

  const pending = checkRuns.filter((c) => c.status !== "completed").length;
  const failed =
    checkRuns.filter((c) => c.conclusion === "failure" || c.conclusion === "timed_out").length +
    statuses.filter((s) => s.state === "failure" || s.state === "error").length;
  const succeeded =
    checkRuns.filter((c) => c.conclusion === "success" || c.conclusion === "neutral").length +
    statuses.filter((s) => s.state === "success").length;
  const pendingStatuses = statuses.filter((s) => s.state === "pending").length;
  const totalPending = pending + pendingStatuses;

  const summary = `${succeeded} passed, ${failed} failed, ${totalPending} pending`;

  if (failed > 0) {
    return { status: "CHECKS_FAILED", summary, checkNames };
  }
  if (totalPending > 0) {
    return { status: "NEEDS_HUMAN_REVIEW", summary: `${summary} — retrieved before all checks finished.`, checkNames };
  }
  return { status: "CHECKS_PASSED", summary, checkNames };
}

/** Used when the Checks/Status API calls themselves failed (not just empty). */
export function buildRetrievalFailedEvidence(reason: string): EvidenceEvaluation {
  const status: EvidenceStatus = "EVIDENCE_RETRIEVAL_FAILED";
  return { status, summary: `Could not retrieve evidence: ${reason}`, checkNames: [] };
}
