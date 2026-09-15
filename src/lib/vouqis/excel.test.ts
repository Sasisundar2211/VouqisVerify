import { describe, expect, it } from "vitest";
import {
  buildEvidenceWorkbook,
  buildEvidenceWorkbookFilename,
  EVIDENCE_SUMMARY_SHEET,
  PR_EVIDENCE_SHEET,
  VERIFICATION_DETAIL_SHEET,
} from "./excel";
import { classifiedPr, META } from "./testFixtures";

const PR_EVIDENCE_HEADER_ORDER = [
  "PR Number",
  "Pull Request",
  "Title",
  "Author",
  "Merged At",
  "Changed Files",
  "AI Sensitive",
  "AI Change Category",
  "Classification Confidence",
  "Classification Reason",
  "Reviewer Evidence",
  "Evidence Status",
  "Check Summary",
  "Requires Action",
];

describe("buildEvidenceWorkbook", () => {
  it("contains exactly the three required worksheets, named exactly", () => {
    const workbook = buildEvidenceWorkbook([classifiedPr({})], META);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      EVIDENCE_SUMMARY_SHEET,
      PR_EVIDENCE_SHEET,
      VERIFICATION_DETAIL_SHEET,
    ]);
  });

  it("summarizes counts that match the filtered live PR list", () => {
    const prs = [
      classifiedPr({ number: 1, evidence: { status: "CHECKS_PASSED", summary: "passed", checkNames: [] } }),
      classifiedPr({
        number: 2,
        classification: { category: "NONE", confidence: "NONE", reason: "No match" },
        evidence: { status: "NO_CHECKS_FOUND", summary: "No checks found", checkNames: [] },
      }),
    ];
    const workbook = buildEvidenceWorkbook(prs, META);
    const sheet = workbook.getWorksheet(EVIDENCE_SUMMARY_SHEET)!;
    const values = sheet.getSheetValues().flat();
    expect(values).toContain(2); // Total Merged PRs Reviewed
    expect(values).toContain(1); // Checks Passed
    expect(values).toContain(1); // No Checks Found
  });

  it("uses distinct classification and verification review labels in the Evidence Summary", () => {
    const prs = [
      classifiedPr({
        number: 1,
        classification: {
          category: "NEEDS_HUMAN_REVIEW",
          confidence: "LOW",
          reason: "Conflicting classification signals",
        },
        evidence: { status: "CHECKS_PASSED", summary: "passed", checkNames: [] },
      }),
      classifiedPr({ number: 2, evidence: { status: "NEEDS_HUMAN_REVIEW", summary: "pending", checkNames: [] } }),
      classifiedPr({ number: 3, evidence: { status: "NEEDS_HUMAN_REVIEW", summary: "pending", checkNames: [] } }),
    ];
    const workbook = buildEvidenceWorkbook(prs, META);
    const sheet = workbook.getWorksheet(EVIDENCE_SUMMARY_SHEET)!;
    const counts = new Map<unknown, unknown>();
    sheet.eachRow((row) => {
      counts.set(row.getCell(1).value, row.getCell(2).value);
    });
    expect(counts.get("Classification Needs Review")).toBe(1);
    expect(counts.get("Verification Evidence Needs Review")).toBe(2);
    expect(counts.has("Needs Human Review")).toBe(false);
  });

  it("explains the distinction between classification and verification evidence review", () => {
    const workbook = buildEvidenceWorkbook([classifiedPr({})], META);
    const sheet = workbook.getWorksheet(EVIDENCE_SUMMARY_SHEET)!;
    expect(sheet.getSheetValues().flat()).toContain(
      "Classification review identifies pull requests whose AI-change category is ambiguous. " +
        "Verification evidence review identifies pull requests whose GitHub checks or verification evidence require human inspection.",
    );
  });

  it("includes the exact required disclaimer text", () => {
    const workbook = buildEvidenceWorkbook([classifiedPr({})], META);
    const sheet = workbook.getWorksheet(EVIDENCE_SUMMARY_SHEET)!;
    const values = sheet.getSheetValues().flat();
    expect(values).toContain(
      "This pack documents identified AI-relevant code changes and associated GitHub review and " +
        "verification evidence. It is not a statement that the AI system is safe, compliant, or approved by an auditor.",
    );
  });

  it("has exactly one PR Evidence row per visible PR", () => {
    const prs = [classifiedPr({ number: 1 }), classifiedPr({ number: 2 }), classifiedPr({ number: 3 })];
    const workbook = buildEvidenceWorkbook(prs, META);
    const sheet = workbook.getWorksheet(PR_EVIDENCE_SHEET)!;
    expect(sheet.rowCount).toBe(prs.length + 1); // + header row
  });

  it("orders the PR Evidence columns exactly as required", () => {
    const workbook = buildEvidenceWorkbook([classifiedPr({})], META);
    const sheet = workbook.getWorksheet(PR_EVIDENCE_SHEET)!;
    const headerRow = sheet.getRow(1);
    const headers = PR_EVIDENCE_HEADER_ORDER.map((_, index) => headerRow.getCell(index + 1).value);
    expect(headers).toEqual(PR_EVIDENCE_HEADER_ORDER);
  });

  it("renders the Pull Request column as a clickable hyperlink", () => {
    const workbook = buildEvidenceWorkbook([classifiedPr({ number: 7, url: "https://github.com/acme-ai/customer-support-agent/pull/7" })], META);
    const sheet = workbook.getWorksheet(PR_EVIDENCE_SHEET)!;
    const cell = sheet.getRow(2).getCell(2);
    expect(cell.isHyperlink).toBe(true);
    expect(cell.hyperlink).toBe("https://github.com/acme-ai/customer-support-agent/pull/7");
    expect(cell.text).toBe("#7");
  });

  it("renders Changed Files as multiline cell content, one file per line", () => {
    const workbook = buildEvidenceWorkbook(
      [classifiedPr({ changedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"] })],
      META,
    );
    const sheet = workbook.getWorksheet(PR_EVIDENCE_SHEET)!;
    const cell = sheet.getRow(2).getCell(6);
    expect(cell.value).toBe("src/a.ts\nsrc/b.ts\nsrc/c.ts");
    expect(cell.alignment?.wrapText).toBe(true);
  });

  it("maps evidence states to explicit text and a matching Requires Action value", () => {
    const workbook = buildEvidenceWorkbook(
      [classifiedPr({ evidence: { status: "CHECKS_FAILED", summary: "1 failed", checkNames: [] } })],
      META,
    );
    const sheet = workbook.getWorksheet(PR_EVIDENCE_SHEET)!;
    const row = sheet.getRow(2);
    expect(row.getCell(12).value).toBe("CHECKS_FAILED");
    expect(row.getCell(14).value).toBe("YES — checks failed");
  });

  it("uses distinct display labels and a combined action reason when both review dimensions apply", () => {
    const workbook = buildEvidenceWorkbook(
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
    const sheet = workbook.getWorksheet(PR_EVIDENCE_SHEET)!;
    const row = sheet.getRow(2);
    expect(row.getCell(8).value).toBe("Classification Needs Review");
    expect(row.getCell(12).value).toBe("Verification Evidence Needs Review");
    expect(row.getCell(14).value).toBe(
      "YES — classification and verification evidence review required",
    );
  });

  it("never exports NO_CHECKS_FOUND as CHECKS_PASSED", () => {
    const workbook = buildEvidenceWorkbook(
      [classifiedPr({ evidence: { status: "NO_CHECKS_FOUND", summary: "No checks found", checkNames: [] } })],
      META,
    );
    const sheet = workbook.getWorksheet(PR_EVIDENCE_SHEET)!;
    expect(sheet.getRow(2).getCell(12).value).toBe("NO_CHECKS_FOUND");
    expect(sheet.getRow(2).getCell(12).value).not.toBe("CHECKS_PASSED");
  });

  it("never exports EVIDENCE_RETRIEVAL_FAILED as CHECKS_PASSED", () => {
    const workbook = buildEvidenceWorkbook(
      [classifiedPr({ evidence: { status: "EVIDENCE_RETRIEVAL_FAILED", summary: "fetch failed", checkNames: [] } })],
      META,
    );
    const sheet = workbook.getWorksheet(PR_EVIDENCE_SHEET)!;
    expect(sheet.getRow(2).getCell(12).value).toBe("EVIDENCE_RETRIEVAL_FAILED");
    expect(sheet.getRow(2).getCell(12).value).not.toBe("CHECKS_PASSED");
  });

  it("produces no rows at all for an empty (filtered) PR list — no fictional filler data", () => {
    const workbook = buildEvidenceWorkbook([], META);
    const prSheet = workbook.getWorksheet(PR_EVIDENCE_SHEET)!;
    const detailSheet = workbook.getWorksheet(VERIFICATION_DETAIL_SHEET)!;
    expect(prSheet.rowCount).toBe(1); // header row only
    expect(detailSheet.rowCount).toBe(1); // header row only
  });

  it("adds a Verification Detail fallback row for PRs with no checks found", () => {
    const workbook = buildEvidenceWorkbook(
      [
        classifiedPr({
          number: 9,
          evidence: { status: "NO_CHECKS_FOUND", summary: "No checks found", checkNames: [] },
          checkRuns: [],
          commitStatuses: [],
          reviews: [],
        }),
      ],
      META,
    );
    const sheet = workbook.getWorksheet(VERIFICATION_DETAIL_SHEET)!;
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(2).getCell(5).value).toBe("NO_CHECKS_FOUND");
  });

  it("adds a Verification Detail fallback row with a safe reason for retrieval failures", () => {
    const workbook = buildEvidenceWorkbook(
      [
        classifiedPr({
          number: 10,
          evidence: { status: "EVIDENCE_RETRIEVAL_FAILED", summary: "Could not retrieve evidence: Not Found", checkNames: [] },
          checkRuns: [],
          commitStatuses: [],
          reviews: [],
        }),
      ],
      META,
    );
    const sheet = workbook.getWorksheet(VERIFICATION_DETAIL_SHEET)!;
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(2).getCell(5).value).toBe("EVIDENCE_RETRIEVAL_FAILED");
    expect(sheet.getRow(2).getCell(6).value).toBe("Could not retrieve evidence: Not Found");
  });

  it("includes one Verification Detail row per real check run and review", () => {
    const workbook = buildEvidenceWorkbook([classifiedPr({ number: 11 })], META);
    const sheet = workbook.getWorksheet(VERIFICATION_DETAIL_SHEET)!;
    // fixture has 2 check runs + 1 review = 3 rows
    expect(sheet.rowCount).toBe(4);
  });
});

describe("buildEvidenceWorkbookFilename", () => {
  it("matches the required pattern with repository and date range", () => {
    expect(buildEvidenceWorkbookFilename(META)).toBe(
      "vouqis-evidence-pack-acme-ai-customer-support-agent-2026-06-01-to-2026-06-30.xlsx",
    );
  });
});
