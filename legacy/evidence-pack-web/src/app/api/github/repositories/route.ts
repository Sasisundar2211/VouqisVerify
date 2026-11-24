import { NextResponse } from "next/server";
import { getInstallationOctokit } from "@/lib/github/client";
import { toSafeGithubError } from "@/lib/github/errors";
import { listInstallationRepositories } from "@/lib/github/pulls";
import { getSessionCookie } from "@/lib/github/session";

export async function GET() {
  const session = await getSessionCookie();
  if (!session) {
    return NextResponse.json({ error: "Not connected to GitHub." }, { status: 401 });
  }

  try {
    const octokit = await getInstallationOctokit(session.installationId);
    const repositories = await listInstallationRepositories(octokit);
    return NextResponse.json({ repositories });
  } catch (error) {
    const safe = toSafeGithubError(error);
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
