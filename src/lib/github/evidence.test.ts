import { describe, expect, it } from "vitest";
import { buildRetrievalFailedEvidence, evaluateEvidence, type CheckRun, type CommitStatus } from "./evidence";

function checkRun(overrides: Partial<CheckRun>): CheckRun {
  return { name: "ci/test", status: "completed", conclusion: "success", ...overrides };
}

describe("evaluateEvidence", () => {
  it("returns NO_CHECKS_FOUND when both APIs succeed but return nothing", () => {
    const result = evaluateEvidence([], []);
    expect(result.status).toBe("NO_CHECKS_FOUND");
  });

  it("returns CHECKS_PASSED when everything completed successfully", () => {
    const result = evaluateEvidence([checkRun({}), checkRun({ conclusion: "neutral" })], []);
    expect(result.status).toBe("CHECKS_PASSED");
  });

  it("returns CHECKS_FAILED when any check run or status failed", () => {
    const result = evaluateEvidence([checkRun({ conclusion: "failure" })], []);
    expect(result.status).toBe("CHECKS_FAILED");
  });

  it("treats a legacy commit status failure the same as a check run failure", () => {
    const statuses: CommitStatus[] = [{ context: "legacy/ci", state: "error" }];
    const result = evaluateEvidence([], statuses);
    expect(result.status).toBe("CHECKS_FAILED");
  });

  it("returns NEEDS_HUMAN_REVIEW when checks are still pending and none have failed", () => {
    const result = evaluateEvidence([checkRun({ status: "in_progress", conclusion: null })], []);
    expect(result.status).toBe("NEEDS_HUMAN_REVIEW");
  });

  it.each(["cancelled", "action_required", "startup_failure", null])(
    "never passes a completed check with conclusion %s",
    (conclusion) => {
      const result = evaluateEvidence([checkRun({ conclusion })], []);
      expect(result.status).toBe("NEEDS_HUMAN_REVIEW");
      expect(result.summary).toContain("0 pending, 1 inconclusive");
    },
  );

  it("collects check and status names for the CSV export", () => {
    const result = evaluateEvidence([checkRun({ name: "ci/lint" })], [{ context: "legacy/ci", state: "success" }]);
    expect(result.checkNames).toEqual(["ci/lint", "legacy/ci"]);
  });
});

describe("buildRetrievalFailedEvidence", () => {
  it("never overlaps with a real evidence status", () => {
    const result = buildRetrievalFailedEvidence("network error");
    expect(result.status).toBe("EVIDENCE_RETRIEVAL_FAILED");
    expect(result.summary).toContain("network error");
  });
});
