import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => {
  const values = new Map<string, string>();
  const options = new Map<string, Record<string, unknown>>();
  return {
    values,
    options,
    store: {
      get: vi.fn((name: string) => {
        const value = values.get(name);
        return value === undefined ? undefined : { name, value };
      }),
      set: vi.fn((name: string, value: string, cookieOptions: Record<string, unknown>) => {
        values.set(name, value);
        options.set(name, cookieOptions);
      }),
      delete: vi.fn((name: string) => values.delete(name)),
    },
  };
});

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieState.store) }));

import { GET } from "./route";
import {
  OAUTH_STATE_COOKIE,
  PENDING_INSTALLATION_COOKIE,
  consumePendingInstallationCookie,
  setInstallStateCookie,
} from "@/lib/github/session";

describe("GET /api/github/setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieState.values.clear();
    cookieState.options.clear();
    process.env.SESSION_SECRET = "test-session-secret-that-is-separate-from-github";
    process.env.GITHUB_APP_CLIENT_ID = "Iv1.test";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  it("rejects a missing installation_id", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/github/setup?setup_action=install&state=install-state"),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/?error=missing_installation");
    expect(cookieState.values.has(PENDING_INSTALLATION_COOKIE)).toBe(false);
  });

  it("stores an encrypted, short-lived pending installation and continues to OAuth", async () => {
    await setInstallStateCookie("install-state");

    const response = await GET(
      new Request(
        "http://localhost:3000/api/github/setup?installation_id=42&setup_action=install&state=install-state",
      ),
    );
    const location = new URL(response.headers.get("location")!);
    const pendingValue = cookieState.values.get(PENDING_INSTALLATION_COOKIE)!;
    const pendingOptions = cookieState.options.get(PENDING_INSTALLATION_COOKIE)!;

    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/github/callback",
    );
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(cookieState.values.has(OAUTH_STATE_COOKIE)).toBe(true);
    expect(pendingValue).not.toContain("42");
    expect(pendingOptions).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 600,
    });
    expect(await consumePendingInstallationCookie()).toBe(42);
  });
});
