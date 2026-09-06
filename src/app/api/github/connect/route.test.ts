import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/github/session", () => ({
  clearGithubConnectionCookies: vi.fn(),
  setInstallStateCookie: vi.fn(),
}));

import { GET } from "./route";
import { clearGithubConnectionCookies, setInstallStateCookie } from "@/lib/github/session";

describe("GET /api/github/connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_APP_SLUG = "vouqis-verify";
    process.env.GITHUB_APP_CLIENT_ID = "Iv1.test";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  it("starts at the App installation URL with a fresh server-stored state", async () => {
    const response = await GET();
    const location = new URL(response.headers.get("location")!);
    const state = location.searchParams.get("state");

    expect(location.origin + location.pathname).toBe(
      "https://github.com/apps/vouqis-verify/installations/new",
    );
    expect(state).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(clearGithubConnectionCookies).toHaveBeenCalledOnce();
    expect(setInstallStateCookie).toHaveBeenCalledWith(state);
  });
});
