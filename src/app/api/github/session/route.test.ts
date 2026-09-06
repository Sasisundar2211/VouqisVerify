import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/github/session", () => ({
  clearSessionCookie: vi.fn(),
  getSessionCookie: vi.fn(),
}));

import { GET } from "./route";
import { getSessionCookie } from "@/lib/github/session";

describe("GET /api/github/session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the existing disconnected response", async () => {
    vi.mocked(getSessionCookie).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ connected: false });
  });
});
