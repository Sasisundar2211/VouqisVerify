import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/github/session", () => ({
  clearGithubConnectionCookies: vi.fn(),
  setOauthStateCookie: vi.fn(),
}));

import { GET } from "./route";
import { clearGithubConnectionCookies, setOauthStateCookie } from "@/lib/github/session";

describe("GET /api/github/connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_APP_SLUG = "vouqis-verify";
    process.env.GITHUB_APP_CLIENT_ID = "Iv1.test";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  it("starts OAuth with a fresh server-stored state", async () => {
    const response = await GET(new Request("http://localhost:3001/api/github/connect"));
    const location = new URL(response.headers.get("location")!);
    const state = location.searchParams.get("state");

    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("Iv1.test");
    expect(location.searchParams.get("redirect_uri")).toBe("http://localhost:3001/api/github/callback");
    expect(state).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(clearGithubConnectionCookies).toHaveBeenCalledOnce();
    expect(setOauthStateCookie).toHaveBeenCalledWith(state);
  });

  it("uses the configured callback URL away from local development", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://vouqis.example.com";

    const response = await GET(new Request("https://preview.example.com/api/github/connect"));
    const location = new URL(response.headers.get("location")!);

    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://vouqis.example.com/api/github/callback",
    );
  });
});
