// Shared fixture factory for evidence-pack export tests (csv.test.ts,
// excel.test.ts). Kept here rather than duplicated so the two suites can't
// silently drift out of sync with the ClassifiedPullRequest shape.

import type { EvidencePackMeta } from "./csv";
import type { ClassifiedPullRequest } from "./types";

export const META: EvidencePackMeta = {
  owner: "acme-ai",
  repo: "customer-support-agent",
  generatedAt: "2026-08-30T12:00:00.000Z",
  from: "2026-06-01",
  to: "2026-06-30",
};

export function classifiedPr(overrides: Partial<ClassifiedPullRequest>): ClassifiedPullRequest {
  return {
    number: 101,
    title: "Rewrite support escalation system prompt",
    body: "",
    url: "https://github.com/acme-ai/customer-support-agent/pull/101",
    author: "priya-dev",
    mergedAt: "2026-06-05",
    changedFiles: ["prompts/support/system_prompt.md"],
    classification: {
      category: "PROMPT",
      confidence: "HIGH",
      reason: "Matched keyword: prompt",
    },
    evidence: {
      status: "CHECKS_PASSED",
      summary: "2 passed, 0 failed, 0 pending",
      checkNames: ["ci/lint", "ci/test"],
    },
    checkRuns: [
      { name: "ci/lint", status: "completed", conclusion: "success", url: "https://github.com/checks/1", recordedAt: "2026-06-05T09:00:00Z" },
      { name: "ci/test", status: "completed", conclusion: "success", url: "https://github.com/checks/2", recordedAt: "2026-06-05T09:05:00Z" },
    ],
    commitStatuses: [],
    reviews: [{ reviewer: "lead-reviewer", state: "APPROVED", recordedAt: "2026-06-05T08:00:00Z" }],
    ...overrides,
  };
}
