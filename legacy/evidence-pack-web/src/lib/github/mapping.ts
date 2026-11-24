// Pure mapping from GitHub's REST API shapes to our domain PullRequest.
// No network calls here — kept separate so it is unit-testable against
// realistic fixture objects.

import type { CheckRunRecord, CommitStatusRecord, PullRequest, ReviewRecord } from "@/lib/vouqis/types";

export interface GithubPullRequestResponse {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user: { login: string } | null;
  merged_at: string | null;
}

export interface GithubFileResponse {
  filename: string;
}

export interface GithubCheckRunResponse {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface GithubCommitStatusResponse {
  context: string;
  state: string;
  target_url: string | null;
  created_at: string | null;
}

export interface GithubReviewResponse {
  user: { login: string } | null;
  state: string;
  submitted_at?: string;
}

/** Throws if the given PR has not been merged — callers should filter first. */
export function mapGithubPullRequest(
  raw: GithubPullRequestResponse,
  files: GithubFileResponse[],
): PullRequest {
  if (!raw.merged_at) {
    throw new Error("Cannot map a pull request that has not been merged");
  }

  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? "",
    url: raw.html_url,
    author: raw.user?.login ?? "unknown",
    mergedAt: raw.merged_at.slice(0, 10),
    changedFiles: files.map((file) => file.filename),
  };
}

export function mapCheckRun(raw: GithubCheckRunResponse): CheckRunRecord {
  return {
    name: raw.name,
    status: raw.status,
    conclusion: raw.conclusion,
    url: raw.html_url,
    recordedAt: raw.completed_at ?? raw.started_at,
  };
}

export function mapCommitStatus(raw: GithubCommitStatusResponse): CommitStatusRecord {
  return {
    name: raw.context,
    state: raw.state,
    url: raw.target_url,
    recordedAt: raw.created_at,
  };
}

export function mapReview(raw: GithubReviewResponse): ReviewRecord {
  return {
    reviewer: raw.user?.login ?? "unknown",
    state: raw.state,
    recordedAt: raw.submitted_at ?? null,
  };
}
