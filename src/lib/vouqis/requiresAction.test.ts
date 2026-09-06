import { describe, expect, it } from "vitest";
import { computeRequiresAction } from "./requiresAction";
import { classifiedPr } from "./testFixtures";

describe("computeRequiresAction", () => {
  it("does not require action for checks-passed, high-confidence PRs", () => {
    const result = computeRequiresAction(
      classifiedPr({ evidence: { status: "CHECKS_PASSED", summary: "2 passed", checkNames: [] } }),
    );
    expect(result).toEqual({ requiresAction: false, label: "NO" });
  });

  it("requires action when checks failed", () => {
    const result = computeRequiresAction(
      classifiedPr({ evidence: { status: "CHECKS_FAILED", summary: "1 failed", checkNames: [] } }),
    );
    expect(result).toEqual({ requiresAction: true, label: "YES — checks failed" });
  });

  it("requires action when no checks were found", () => {
    const result = computeRequiresAction(
      classifiedPr({ evidence: { status: "NO_CHECKS_FOUND", summary: "No checks found", checkNames: [] } }),
    );
    expect(result).toEqual({ requiresAction: true, label: "YES — no checks found" });
  });

  it("requires action when evidence retrieval failed", () => {
    const result = computeRequiresAction(
      classifiedPr({ evidence: { status: "EVIDENCE_RETRIEVAL_FAILED", summary: "fetch failed", checkNames: [] } }),
    );
    expect(result).toEqual({ requiresAction: true, label: "YES — evidence retrieval failed" });
  });

  it("requires classification review when only the category needs human review", () => {
    const result = computeRequiresAction(
      classifiedPr({
        classification: {
          category: "NEEDS_HUMAN_REVIEW",
          confidence: "LOW",
          reason: "Conflicting classification signals",
        },
      }),
    );
    expect(result).toEqual({
      requiresAction: true,
      label: "YES — classification review required",
    });
  });

  it("requires verification evidence review when only evidence needs human review", () => {
    const result = computeRequiresAction(
      classifiedPr({ evidence: { status: "NEEDS_HUMAN_REVIEW", summary: "pending", checkNames: [] } }),
    );
    expect(result).toEqual({
      requiresAction: true,
      label: "YES — verification evidence review required",
    });
  });

  it("requires classification and verification evidence review when both need human review", () => {
    const result = computeRequiresAction(
      classifiedPr({
        classification: {
          category: "NEEDS_HUMAN_REVIEW",
          confidence: "LOW",
          reason: "Conflicting classification signals",
        },
        evidence: { status: "NEEDS_HUMAN_REVIEW", summary: "pending", checkNames: [] },
      }),
    );
    expect(result).toEqual({
      requiresAction: true,
      label: "YES — classification and verification evidence review required",
    });
  });

  it("requires action for checks-passed, low-confidence classification", () => {
    const result = computeRequiresAction(
      classifiedPr({
        evidence: { status: "CHECKS_PASSED", summary: "2 passed", checkNames: [] },
        classification: { category: "PROMPT", confidence: "LOW", reason: "Weak keyword match" },
      }),
    );
    expect(result).toEqual({ requiresAction: true, label: "YES — review required" });
  });
});
