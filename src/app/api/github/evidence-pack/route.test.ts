import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/github/client", () => ({ getInstallationOctokit: vi.fn() }));
vi.mock("@/lib/github/pulls", () => ({ fetchMergedPullRequestsInRange: vi.fn() }));
vi.mock("@/lib/github/session", () => ({ getSessionCookie: vi.fn() }));

import { getInstallationOctokit } from "@/lib/github/client";
import { fetchMergedPullRequestsInRange } from "@/lib/github/pulls";
import { getSessionCookie } from "@/lib/github/session";
import { classifiedPr } from "@/lib/vouqis/testFixtures";
import { GET } from "./route";

const URL =
  "http://localhost/api/github/evidence-pack?owner=acme-ai&repo=agent&from=2026-06-01&to=2026-06-30";
const SESSION = {
  installationId: 42,
  accountLogin: "acme-ai",
  connectedAt: "2026-06-01T00:00:00Z",
};

describe("GET /api/github/evidence-pack", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an unauthenticated request before contacting GitHub", async () => {
    vi.mocked(getSessionCookie).mockResolvedValue(null);

    const response = await GET(new Request(URL));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not connected to GitHub." });
    expect(getInstallationOctokit).not.toHaveBeenCalled();
  });

  it("rejects an invalid repository before contacting GitHub", async () => {
    vi.mocked(getSessionCookie).mockResolvedValue(SESSION);

    const response = await GET(new Request(URL.replace("owner=acme-ai", "owner=acme%2Fai")));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid repository." });
    expect(getInstallationOctokit).not.toHaveBeenCalled();
  });

  it("rejects an invalid date range before contacting GitHub", async () => {
    vi.mocked(getSessionCookie).mockResolvedValue(SESSION);

    const response = await GET(new Request(URL.replace("2026-06-01", "2026-07-01")));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid date range." });
    expect(getInstallationOctokit).not.toHaveBeenCalled();
  });

  it("returns evidence from the session installation and requested range", async () => {
    const octokit = {} as Awaited<ReturnType<typeof getInstallationOctokit>>;
    const pullRequests = [classifiedPr({ number: 101 })];
    vi.mocked(getSessionCookie).mockResolvedValue(SESSION);
    vi.mocked(getInstallationOctokit).mockResolvedValue(octokit);
    vi.mocked(fetchMergedPullRequestsInRange).mockResolvedValue(pullRequests);

    const response = await GET(new Request(URL));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getInstallationOctokit).toHaveBeenCalledWith(42);
    expect(fetchMergedPullRequestsInRange).toHaveBeenCalledWith(
      octokit,
      "acme-ai",
      "agent",
      "2026-06-01",
      "2026-06-30",
    );
    expect(body.pullRequests).toEqual(pullRequests);
    expect(body.meta).toMatchObject({
      owner: "acme-ai",
      repo: "agent",
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(Number.isNaN(Date.parse(body.meta.generatedAt))).toBe(false);
  });

  it("maps GitHub failures to a safe public error", async () => {
    const octokit = {} as Awaited<ReturnType<typeof getInstallationOctokit>>;
    vi.mocked(getSessionCookie).mockResolvedValue(SESSION);
    vi.mocked(getInstallationOctokit).mockResolvedValue(octokit);
    vi.mocked(fetchMergedPullRequestsInRange).mockRejectedValue({
      status: 500,
      message: "token ghp_secret must never escape",
    });

    const response = await GET(new Request(URL));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Something went wrong while contacting GitHub. Please try again." });
    expect(JSON.stringify(body)).not.toContain("ghp_secret");
  });
});
