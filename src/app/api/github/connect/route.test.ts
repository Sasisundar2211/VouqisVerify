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

  it("uses the request origin when the configured app URL is blank", async () => {
    process.env.NEXT_PUBLIC_APP_URL = " ";
    const response = await GET(new Request("https://vouqis.example.com/api/github/connect"));
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("redirect_uri")).toBe("https://vouqis.example.com/api/github/callback");
  });

  it("never emits a localhost callback for a public request", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    const response = await GET(new Request("https://vouqis-verify.vercel.app/api/github/connect"));
    const location = new URL(response.headers.get("location")!);

    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://vouqis-verify.vercel.app/api/github/callback",
    );
  });

  it("uses the request origin when the configured app URL is not a valid URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "not-a-url";
    const response = await GET(new Request("https://vouqis.example.com/api/github/connect"));
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("redirect_uri")).toBe("https://vouqis.example.com/api/github/callback");
  });

  it("uses the proxy-forwarded public host when the server sees a loopback URL", async () => {
    // `next start` behind a reverse proxy reports request.url as localhost:<port>.
    process.env.NEXT_PUBLIC_APP_URL = " ";
    const request = new Request("http://localhost:3000/api/github/connect", {
      headers: { "x-forwarded-host": "vouqis.example.com", "x-forwarded-proto": "https" },
    });
    const location = new URL((await GET(request)).headers.get("location")!);
    expect(location.searchParams.get("redirect_uri")).toBe("https://vouqis.example.com/api/github/callback");
  });

  it("uses the configured public URL when a self-hosted server sees a loopback URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://vouqis.example.com";
    const request = new Request("http://localhost:3000/api/github/connect", {
      headers: { host: "vouqis.example.com", "x-forwarded-proto": "https" },
    });
    const location = new URL((await GET(request)).headers.get("location")!);
    expect(location.searchParams.get("redirect_uri")).toBe("https://vouqis.example.com/api/github/callback");
  });

  it("ignores a malformed forwarded host", async () => {
    process.env.NEXT_PUBLIC_APP_URL = " ";
    const request = new Request("https://vouqis.example.com/api/github/connect", {
      headers: { "x-forwarded-host": "evil.example/@x" },
    });
    const location = new URL((await GET(request)).headers.get("location")!);
    expect(location.searchParams.get("redirect_uri")).toBe("https://vouqis.example.com/api/github/callback");
  });

  it("returns 500 when the GitHub App client ID is missing", async () => {
    delete process.env.GITHUB_APP_CLIENT_ID;
    const response = await GET(new Request("https://vouqis.example.com/api/github/connect"));
    expect(response.status).toBe(500);
    expect(setOauthStateCookie).not.toHaveBeenCalled();
  });
});
