import { NextResponse } from "next/server";
import { getSessionCookie } from "@/lib/github/session";
import { isValidIsoDateRange, isValidRepository } from "@/lib/github/validate";
import type { EvidencePackMeta } from "@/lib/vouqis/csv";
import { buildEvidenceWorkbook, buildEvidenceWorkbookFilename } from "@/lib/vouqis/excel";
import type { ClassifiedPullRequest } from "@/lib/vouqis/types";

interface RequestBody {
  pullRequests: ClassifiedPullRequest[];
  meta: EvidencePackMeta;
}

// The client already fetched and classified these PRs via GET /evidence-pack;
// this route only re-shapes that exact data into a workbook, so validation
// here is a shallow shape check, not a re-fetch of GitHub's own guarantees.
function isValidRequestBody(value: unknown): value is RequestBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.pullRequests)) return false;
  if (typeof body.meta !== "object" || body.meta === null) return false;

  const meta = body.meta as Record<string, unknown>;
  if (typeof meta.owner !== "string" || typeof meta.repo !== "string") return false;
  if (typeof meta.generatedAt !== "string" || typeof meta.from !== "string" || typeof meta.to !== "string") {
    return false;
  }

  return body.pullRequests.every((pr) => {
    if (typeof pr !== "object" || pr === null) return false;
    const record = pr as Record<string, unknown>;
    return (
      typeof record.number === "number" &&
      typeof record.title === "string" &&
      typeof record.url === "string" &&
      Array.isArray(record.changedFiles) &&
      typeof record.classification === "object" &&
      typeof record.evidence === "object" &&
      Array.isArray(record.checkRuns) &&
      Array.isArray(record.commitStatuses) &&
      Array.isArray(record.reviews)
    );
  });
}

export async function POST(request: Request) {
  const session = await getSessionCookie();
  if (!session) {
    return NextResponse.json({ error: "Not connected to GitHub." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isValidRequestBody(body)) {
    return NextResponse.json({ error: "Invalid evidence pack data." }, { status: 400 });
  }

  const { pullRequests, meta } = body;

  if (!isValidRepository(meta.owner, meta.repo)) {
    return NextResponse.json({ error: "Invalid repository." }, { status: 400 });
  }
  if (!isValidIsoDateRange(meta.from, meta.to)) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  const workbook = buildEvidenceWorkbook(pullRequests, meta);
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${buildEvidenceWorkbookFilename(meta)}"`,
    },
  });
}
