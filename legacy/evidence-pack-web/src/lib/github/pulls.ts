// Orchestrates the live evidence pack: search for merged PRs in range, fetch
// each one's full detail + changed files + checks/statuses, classify, and
// evaluate evidence. All network I/O lives here — everything it calls into
// (mapping, classifier, evidence) is pure and unit-tested separately.

import { classifyPullRequest } from "@/lib/vouqis/classifier";
import type { CheckRunRecord, ClassifiedPullRequest, CommitStatusRecord, ReviewRecord } from "@/lib/vouqis/types";
import { buildRetrievalFailedEvidence, evaluateEvidence } from "./evidence";
import { mapCheckRun, mapCommitStatus, mapGithubPullRequest, mapReview } from "./mapping";

type InstallationOctokit = Awaited<ReturnType<typeof import("./client").getInstallationOctokit>>;

export interface Repository {
  owner: string;
  repo: string;
  fullName: string;
}

export async function listInstallationRepositories(octokit: InstallationOctokit): Promise<Repository[]> {
  const repos = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 });
  return repos.map((r) => ({ owner: r.owner.login, repo: r.name, fullName: r.full_name }));
}

async function fetchOnePullRequest(
  octokit: InstallationOctokit,
  owner: string,
  repo: string,
  number: number,
): Promise<ClassifiedPullRequest> {
  const [{ data: pr }, files] = await Promise.all([
    octokit.rest.pulls.get({ owner, repo, pull_number: number }),
    octokit.paginate(octokit.rest.pulls.listFiles, { owner, repo, pull_number: number, per_page: 100 }),
  ]);

  const pullRequest = mapGithubPullRequest(pr, files);
  const classification = classifyPullRequest(pullRequest);

  let evidence;
  let checkRuns: CheckRunRecord[] = [];
  let commitStatuses: CommitStatusRecord[] = [];
  let reviews: ReviewRecord[] = [];
  try {
    const [rawCheckRuns, { data: combinedStatus }, rawReviews] = await Promise.all([
      octokit.paginate(octokit.rest.checks.listForRef, { owner, repo, ref: pr.head.sha, per_page: 100 }),
      octokit.rest.repos.getCombinedStatusForRef({ owner, repo, ref: pr.head.sha }),
      octokit.paginate(octokit.rest.pulls.listReviews, { owner, repo, pull_number: number, per_page: 100 }),
    ]);
    evidence = evaluateEvidence(rawCheckRuns, combinedStatus.statuses);
    checkRuns = rawCheckRuns.map(mapCheckRun);
    commitStatuses = combinedStatus.statuses.map(mapCommitStatus);
    reviews = rawReviews.map(mapReview);
  } catch (error) {
    evidence = buildRetrievalFailedEvidence(error instanceof Error ? error.message : "unknown error");
  }

  return { ...pullRequest, classification, evidence, checkRuns, commitStatuses, reviews };
}

/** Inclusive ISO date range (YYYY-MM-DD), same semantics as the GitHub search API. */
export async function fetchMergedPullRequestsInRange(
  octokit: InstallationOctokit,
  owner: string,
  repo: string,
  from: string,
  to: string,
): Promise<ClassifiedPullRequest[]> {
  const query = `repo:${owner}/${repo} is:pr is:merged merged:${from}..${to}`;
  const results = await octokit.paginate(octokit.rest.search.issuesAndPullRequests, { q: query, per_page: 100 });

  const pullRequests: ClassifiedPullRequest[] = [];
  for (const item of results) {
    pullRequests.push(await fetchOnePullRequest(octokit, owner, repo, item.number));
  }
  return pullRequests;
}
