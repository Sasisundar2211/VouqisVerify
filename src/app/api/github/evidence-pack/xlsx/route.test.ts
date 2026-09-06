import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/github/session", () => ({
  getSessionCookie: vi.fn(),
}));

import { POST } from "./route";
import { getSessionCookie } from "@/lib/github/session";
import { classifiedPr, META } from "@/lib/vouqis/testFixtures";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/github/evidence-pack/xlsx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/github/evidence-pack/xlsx", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects when there is no session", async () => {
    vi.mocked(getSessionCookie).mockResolvedValue(null);
    const response = await POST(jsonRequest({ pullRequests: [], meta: META }));
    expect(response.status).toBe(401);
  });

  it("rejects malformed evidence pack data", async () => {
    vi.mocked(getSessionCookie).mockResolvedValue({
      installationId: 1,
      accountLogin: "acme-ai",
      connectedAt: "2026-06-01T00:00:00Z",
    });
    const response = await POST(jsonRequest({ pullRequests: "not-an-array", meta: META }));
    expect(response.status).toBe(400);
  });

  it("rejects an invalid date range", async () => {
    vi.mocked(getSessionCookie).mockResolvedValue({
      installationId: 1,
      accountLogin: "acme-ai",
      connectedAt: "2026-06-01T00:00:00Z",
    });
    const response = await POST(
      jsonRequest({ pullRequests: [], meta: { ...META, from: "2026-06-30", to: "2026-06-01" } }),
    );
    expect(response.status).toBe(400);
  });

  it("returns a real .xlsx workbook with the required filename and content type", async () => {
    vi.mocked(getSessionCookie).mockResolvedValue({
      installationId: 1,
      accountLogin: "acme-ai",
      connectedAt: "2026-06-01T00:00:00Z",
    });
    const response = await POST(jsonRequest({ pullRequests: [classifiedPr({})], meta: META }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("Content-Disposition")).toContain(
      "vouqis-evidence-pack-acme-ai-customer-support-agent-2026-06-01-to-2026-06-30.xlsx",
    );
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.length).toBeGreaterThan(0);
    // .xlsx files are zip archives and start with the "PK" local file header signature.
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");
  });
});
