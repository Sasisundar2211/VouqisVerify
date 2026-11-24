import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    store: {
      get: vi.fn((name: string) => {
        const value = values.get(name);
        return value === undefined ? undefined : { name, value };
      }),
      set: vi.fn((name: string, value: string) => values.set(name, value)),
      delete: vi.fn((name: string) => values.delete(name)),
    },
  };
});

const github = vi.hoisted(() => ({
  exchangeGithubOauthCode: vi.fn(),
  findUserAppInstallation: vi.fn(),
  verifyUserInstallationAccess: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieState.store) }));
vi.mock("@/lib/github/client", () => github);

import { GET } from "./route";
import {
  INSTALL_STATE_COOKIE,
  OAUTH_STATE_COOKIE,
  PENDING_INSTALLATION_COOKIE,
  getSessionCookie,
  setOauthStateCookie,
  setPendingInstallationCookie,
} from "@/lib/github/session";

const callbackUrl = (query: string) =>
  new Request(`http://localhost:3000/api/github/callback?${query}`);

describe("GET /api/github/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieState.values.clear();
    process.env.SESSION_SECRET = "test-session-secret-that-is-separate-from-github";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.GITHUB_APP_SLUG = "vouqis-verify";
    github.exchangeGithubOauthCode.mockResolvedValue("user-token");
    github.findUserAppInstallation.mockResolvedValue({ installationId: 42, accountLogin: "octocat" });
    github.verifyUserInstallationAccess.mockResolvedValue({ accountLogin: "octocat" });
  });

  it("rejects missing state", async () => {
    await setOauthStateCookie("expected-state");
    const response = await GET(callbackUrl("code=authorization-code"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/?error=invalid_state");
    expect(github.exchangeGithubOauthCode).not.toHaveBeenCalled();
  });

  it("rejects mismatched state", async () => {
    await setOauthStateCookie("expected-state");
    const response = await GET(callbackUrl("code=authorization-code&state=wrong-state"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/?error=invalid_state");
  });

  it("rejects expired state", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-05T00:00:00Z"));
      await setOauthStateCookie("expected-state");
      await setPendingInstallationCookie(42);
      vi.advanceTimersByTime(10 * 60 * 1000 + 1);

      const response = await GET(callbackUrl("code=authorization-code&state=expected-state"));
      expect(response.headers.get("location")).toBe("http://localhost:3000/?error=invalid_state");
      expect(github.exchangeGithubOauthCode).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a missing authorization code", async () => {
    await setOauthStateCookie("expected-state");
    const response = await GET(callbackUrl("state=expected-state"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/?error=missing_code");
  });

  it("connects a returning user by discovering an existing installation", async () => {
    await setOauthStateCookie("expected-state");
    const response = await GET(callbackUrl("code=authorization-code&state=expected-state"));

    expect(github.findUserAppInstallation).toHaveBeenCalledWith("user-token");
    expect(await getSessionCookie()).toMatchObject({ installationId: 42, accountLogin: "octocat" });
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("sends a first-time user to install the App", async () => {
    await setOauthStateCookie("expected-state");
    github.findUserAppInstallation.mockResolvedValue(null);

    const response = await GET(callbackUrl("code=authorization-code&state=expected-state"));
    const location = new URL(response.headers.get("location")!);
    const installState = location.searchParams.get("state");

    expect(location.origin + location.pathname).toBe(
      "https://github.com/apps/vouqis-verify/installations/new",
    );
    expect(installState).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(cookieState.values.has(INSTALL_STATE_COOKIE)).toBe(true);
  });

  it("rejects a user who cannot access the pending installation", async () => {
    await setOauthStateCookie("expected-state");
    await setPendingInstallationCookie(42);
    github.verifyUserInstallationAccess.mockResolvedValue(null);

    const response = await GET(callbackUrl("code=authorization-code&state=expected-state"));

    expect(github.verifyUserInstallationAccess).toHaveBeenCalledWith("user-token", 42);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/?error=unauthorized_installation",
    );
    expect(await getSessionCookie()).toBeNull();
  });

  it("connects only with valid state, code, and authorized installation access", async () => {
    await setOauthStateCookie("expected-state");
    await setPendingInstallationCookie(42);

    const response = await GET(callbackUrl("code=authorization-code&state=expected-state"));
    const session = await getSessionCookie();

    expect(github.exchangeGithubOauthCode).toHaveBeenCalledWith(
      "authorization-code",
      "http://localhost:3000/api/github/callback",
    );
    expect(github.verifyUserInstallationAccess).toHaveBeenCalledWith("user-token", 42);
    expect(github.findUserAppInstallation).not.toHaveBeenCalled();
    expect(session).toMatchObject({ installationId: 42, accountLogin: "octocat" });
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(response.headers.get("location")).not.toContain("missing_installation");
  });

  it("clears one-time state after use so it cannot be replayed", async () => {
    await setOauthStateCookie("expected-state");
    await setPendingInstallationCookie(42);

    await GET(callbackUrl("code=authorization-code&state=expected-state"));

    expect(cookieState.values.has(INSTALL_STATE_COOKIE)).toBe(false);
    expect(cookieState.values.has(OAUTH_STATE_COOKIE)).toBe(false);
    expect(cookieState.values.has(PENDING_INSTALLATION_COOKIE)).toBe(false);

    const replay = await GET(callbackUrl("code=authorization-code&state=expected-state"));
    expect(replay.headers.get("location")).toBe("http://localhost:3000/?error=invalid_state");
  });

  it("returns a safe error when GitHub authorization fails", async () => {
    await setOauthStateCookie("expected-state");
    await setPendingInstallationCookie(42);
    github.exchangeGithubOauthCode.mockRejectedValue(new Error("raw secret-bearing GitHub error"));

    const response = await GET(callbackUrl("code=sensitive-code&state=expected-state"));
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/?error=github_authorization_failed",
    );
    expect(response.headers.get("location")).not.toContain("sensitive-code");
  });
});
