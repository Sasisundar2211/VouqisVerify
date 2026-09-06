import { NextResponse } from "next/server";
import { getInstallationOctokit } from "@/lib/github/client";
import { toSafeGithubError } from "@/lib/github/errors";
import { fetchMergedPullRequestsInRange } from "@/lib/github/pulls";
import { getSessionCookie } from "@/lib/github/session";
import { isValidIsoDateRange, isValidRepository } from "@/lib/github/validate";

export async function GET(request: Request) {
  const session = await getSessionCookie();
  if (!session) {
    return NextResponse.json({ error: "Not connected to GitHub." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner") ?? "";
  const repo = searchParams.get("repo") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  if (!isValidRepository(owner, repo)) {
    return NextResponse.json({ error: "Invalid repository." }, { status: 400 });
  }
  if (!isValidIsoDateRange(from, to)) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  try {
    const octokit = await getInstallationOctokit(session.installationId);
    const pullRequests = await fetchMergedPullRequestsInRange(octokit, owner, repo, from, to);
    return NextResponse.json({
      pullRequests,
      meta: { owner, repo, from, to, generatedAt: new Date().toISOString() },
    });
  } catch (error) {
    const safe = toSafeGithubError(error);
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
