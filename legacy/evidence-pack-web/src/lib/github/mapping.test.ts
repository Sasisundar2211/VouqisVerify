import { describe, expect, it } from "vitest";
import {
  mapCheckRun,
  mapCommitStatus,
  mapGithubPullRequest,
  mapReview,
  type GithubPullRequestResponse,
} from "./mapping";

function rawPr(overrides: Partial<GithubPullRequestResponse>): GithubPullRequestResponse {
  return {
    number: 42,
    title: "Add reranker for FAQ index",
    body: "Improves retrieval precision.",
    html_url: "https://github.com/acme-ai/customer-support-agent/pull/42",
    user: { login: "priya-dev" },
    merged_at: "2026-06-05T10:15:00Z",
    ...overrides,
  };
}

describe("mapGithubPullRequest", () => {
  it("maps GitHub fields onto the domain PullRequest shape", () => {
    const result = mapGithubPullRequest(rawPr({}), [{ filename: "src/lib/retrieval/reranker.ts" }]);
    expect(result).toEqual({
      number: 42,
      title: "Add reranker for FAQ index",
      body: "Improves retrieval precision.",
      url: "https://github.com/acme-ai/customer-support-agent/pull/42",
      author: "priya-dev",
      mergedAt: "2026-06-05",
      changedFiles: ["src/lib/retrieval/reranker.ts"],
    });
  });

  it("falls back to defaults for a null body and missing user", () => {
    const result = mapGithubPullRequest(rawPr({ body: null, user: null }), []);
    expect(result.body).toBe("");
    expect(result.author).toBe("unknown");
  });

  it("throws for a PR that has not been merged", () => {
    expect(() => mapGithubPullRequest(rawPr({ merged_at: null }), [])).toThrow();
  });
});

describe("mapCheckRun", () => {
  it("maps a completed check run", () => {
    const result = mapCheckRun({
      name: "ci/lint",
      status: "completed",
      conclusion: "success",
      html_url: "https://github.com/acme-ai/customer-support-agent/runs/1",
      started_at: "2026-06-05T09:00:00Z",
      completed_at: "2026-06-05T09:01:00Z",
    });
    expect(result).toEqual({
      name: "ci/lint",
      status: "completed",
      conclusion: "success",
      url: "https://github.com/acme-ai/customer-support-agent/runs/1",
      recordedAt: "2026-06-05T09:01:00Z",
    });
  });

  it("falls back to started_at when completed_at is missing", () => {
    const result = mapCheckRun({
      name: "ci/test",
      status: "in_progress",
      conclusion: null,
      html_url: null,
      started_at: "2026-06-05T09:00:00Z",
      completed_at: null,
    });
    expect(result.recordedAt).toBe("2026-06-05T09:00:00Z");
  });
});

describe("mapCommitStatus", () => {
  it("maps a commit status onto the domain shape", () => {
    const result = mapCommitStatus({
      context: "ci/legacy-status",
      state: "success",
      target_url: "https://github.com/acme-ai/customer-support-agent/statuses/1",
      created_at: "2026-06-05T09:00:00Z",
    });
    expect(result).toEqual({
      name: "ci/legacy-status",
      state: "success",
      url: "https://github.com/acme-ai/customer-support-agent/statuses/1",
      recordedAt: "2026-06-05T09:00:00Z",
    });
  });
});

describe("mapReview", () => {
  it("maps a review onto the domain shape", () => {
    const result = mapReview({
      user: { login: "lead-reviewer" },
      state: "APPROVED",
      submitted_at: "2026-06-05T08:00:00Z",
    });
    expect(result).toEqual({ reviewer: "lead-reviewer", state: "APPROVED", recordedAt: "2026-06-05T08:00:00Z" });
  });

  it("falls back to 'unknown' for a missing reviewer", () => {
    const result = mapReview({ user: null, state: "COMMENTED" });
    expect(result.reviewer).toBe("unknown");
  });
});
