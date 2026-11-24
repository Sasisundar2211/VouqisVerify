import { describe, expect, it } from "vitest";
import { buildEvidenceCsv, buildEvidenceCsvFilename } from "./csv";
import { classifiedPr, META } from "./testFixtures";

describe("buildEvidenceCsv", () => {
  it("starts with a UTF-8 BOM", () => {
    const csv = buildEvidenceCsv([classifiedPr({})], META);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("uses CRLF row endings and every field quoted", () => {
    const csv = buildEvidenceCsv([classifiedPr({})], META);
    const body = csv.slice(1); // strip BOM
    const lines = body.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith('"Repository"')).toBe(true);
    expect(lines[1].startsWith('"acme-ai/customer-support-agent"')).toBe(true);
  });

  it("emits the exact 18-column header, ending with Requires Action", () => {
    const csv = buildEvidenceCsv([], META);
    const header = csv.slice(1).split("\r\n")[0];
    const columns = header.split('","');
    expect(columns).toHaveLength(18);
    expect(columns.at(-1)).toBe('Requires Action"');
  });

  it("repeats pack-level metadata on every row", () => {
    const csv = buildEvidenceCsv([classifiedPr({ number: 1 }), classifiedPr({ number: 2 })], META);
    const rows = csv.slice(1).split("\r\n").slice(1);
    for (const row of rows) {
      expect(row).toContain('"acme-ai/customer-support-agent"');
      expect(row).toContain('"2026-06-01"');
      expect(row).toContain('"2026-06-30"');
    }
  });

  it("marks AI-sensitive categories and evidence status distinctly", () => {
    const csv = buildEvidenceCsv(
      [
        classifiedPr({
          number: 1,
          classification: { category: "NONE", confidence: "NONE", reason: "No match" },
          evidence: { status: "NO_CHECKS_FOUND", summary: "No checks found", checkNames: [] },
        }),
      ],
      META,
    );
    const row = csv.slice(1).split("\r\n")[1];
    expect(row).toContain('"false"');
    expect(row).toContain('"NO_CHECKS_FOUND"');
  });

  it("never renders a retrieval failure as a passing evidence status", () => {
    const csv = buildEvidenceCsv(
      [classifiedPr({ evidence: { status: "EVIDENCE_RETRIEVAL_FAILED", summary: "fetch failed", checkNames: [] } })],
      META,
    );
    const row = csv.slice(1).split("\r\n")[1];
    expect(row).toContain('"EVIDENCE_RETRIEVAL_FAILED"');
    expect(row).not.toContain('"CHECKS_PASSED"');
  });

  it("quotes and escapes fields containing commas or quotes", () => {
    const csv = buildEvidenceCsv([classifiedPr({ title: 'Add "smart" retry, with backoff' })], META);
    const row = csv.slice(1).split("\r\n")[1];
    expect(row).toContain('"Add ""smart"" retry, with backoff"');
  });

  it("returns only the header for an empty (filtered) PR list", () => {
    const csv = buildEvidenceCsv([], META);
    expect(csv.slice(1).split("\r\n")).toHaveLength(1);
  });

  it("exports Requires Action = NO for checks-passed, high-confidence PRs", () => {
    const csv = buildEvidenceCsv(
      [classifiedPr({ evidence: { status: "CHECKS_PASSED", summary: "2 passed", checkNames: [] } })],
      META,
    );
    const row = csv.slice(1).split("\r\n")[1];
    expect(row.endsWith('"NO"')).toBe(true);
  });

  it("exports Requires Action = YES — checks failed for CHECKS_FAILED", () => {
    const csv = buildEvidenceCsv(
      [classifiedPr({ evidence: { status: "CHECKS_FAILED", summary: "1 failed", checkNames: [] } })],
      META,
    );
    const row = csv.slice(1).split("\r\n")[1];
    expect(row.endsWith('"YES — checks failed"')).toBe(true);
  });

  it("exports Requires Action = YES — no checks found for NO_CHECKS_FOUND", () => {
    const csv = buildEvidenceCsv(
      [classifiedPr({ evidence: { status: "NO_CHECKS_FOUND", summary: "No checks found", checkNames: [] } })],
      META,
    );
    const row = csv.slice(1).split("\r\n")[1];
    expect(row.endsWith('"YES — no checks found"')).toBe(true);
  });

  it("exports Requires Action = YES — evidence retrieval failed for EVIDENCE_RETRIEVAL_FAILED", () => {
    const csv = buildEvidenceCsv(
      [classifiedPr({ evidence: { status: "EVIDENCE_RETRIEVAL_FAILED", summary: "fetch failed", checkNames: [] } })],
      META,
    );
    const row = csv.slice(1).split("\r\n")[1];
    expect(row.endsWith('"YES — evidence retrieval failed"')).toBe(true);
  });

  it("preserves distinct internal review values and exports the combined specific action reason", () => {
    const csv = buildEvidenceCsv(
      [
        classifiedPr({
          classification: {
            category: "NEEDS_HUMAN_REVIEW",
            confidence: "LOW",
            reason: "Conflicting classification signals",
          },
          evidence: { status: "NEEDS_HUMAN_REVIEW", summary: "pending", checkNames: [] },
        }),
      ],
      META,
    );
    const row = csv.slice(1).split("\r\n")[1];
    const columns = row.slice(1, -1).split('\",\"');
    expect(columns[11]).toBe("NEEDS_HUMAN_REVIEW");
    expect(columns[14]).toBe("NEEDS_HUMAN_REVIEW");
    expect(columns[17]).toBe("YES — classification and verification evidence review required");
  });

  it("exports the classification-specific action reason", () => {
    const csv = buildEvidenceCsv(
      [
        classifiedPr({
          classification: {
            category: "NEEDS_HUMAN_REVIEW",
            confidence: "LOW",
            reason: "Conflicting classification signals",
          },
        }),
      ],
      META,
    );
    expect(csv.slice(1).split("\r\n")[1]).toContain(
      '"YES — classification review required"',
    );
  });

  it("exports the verification-evidence-specific action reason", () => {
    const csv = buildEvidenceCsv(
      [classifiedPr({ evidence: { status: "NEEDS_HUMAN_REVIEW", summary: "pending", checkNames: [] } })],
      META,
    );
    expect(csv.slice(1).split("\r\n")[1]).toContain(
      '"YES — verification evidence review required"',
    );
  });
});

describe("buildEvidenceCsvFilename", () => {
  it("matches the required pattern", () => {
    expect(buildEvidenceCsvFilename(META)).toBe(
      "vouqis-evidence-pack-acme-ai-customer-support-agent-2026-06-01-to-2026-06-30.csv",
    );
  });
});
