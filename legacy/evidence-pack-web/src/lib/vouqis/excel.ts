// Builds the real .xlsx Evidence Pack workbook from exactly the classified
// PRs handed in — no fetching, no fabrication. Mirrors csv.ts's contract:
// callers must pass only the rows currently displayed/filtered. Kept
// synchronous and DOM-free (only `workbook.xlsx.writeBuffer()` is async) so
// it runs the same way in a Node API route as it would in a unit test.

import ExcelJS from "exceljs";
import { buildEvidencePackFilename, type EvidencePackMeta } from "./csv";
import { summarize } from "./filters";
import { computeRequiresAction } from "./requiresAction";
import {
  CATEGORY_LABELS,
  isAiSensitive,
  type ClassifiedPullRequest,
  type EvidenceStatus,
  type ReviewRecord,
} from "./types";

export const EVIDENCE_SUMMARY_SHEET = "Evidence Summary";
export const PR_EVIDENCE_SHEET = "PR Evidence";
export const VERIFICATION_DETAIL_SHEET = "Verification Detail";

const DISCLAIMER =
  "This evidence pack identifies AI-relevant GitHub pull requests and associated review and " +
  "verification evidence. It does not certify that an AI system is safe, compliant, approved, or audit-ready.";

const REVIEW_DISTINCTION_NOTE =
  "Classification review identifies pull requests whose AI-change category is ambiguous. " +
  "Verification evidence review identifies pull requests whose GitHub checks or verification evidence require human inspection.";

const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, string> = {
  CHECKS_PASSED: "CHECKS_PASSED",
  CHECKS_FAILED: "CHECKS_FAILED",
  NO_CHECKS_FOUND: "NO_CHECKS_FOUND",
  EVIDENCE_RETRIEVAL_FAILED: "EVIDENCE_RETRIEVAL_FAILED",
  NEEDS_HUMAN_REVIEW: "Verification Evidence Needs Review",
};

const EVIDENCE_STATUS_COLORS: Record<EvidenceStatus, { fill: string; font: string }> = {
  CHECKS_PASSED: { fill: "FFC6EFCE", font: "FF006100" },
  CHECKS_FAILED: { fill: "FFFFC7CE", font: "FF9C0006" },
  NO_CHECKS_FOUND: { fill: "FFD9D9D9", font: "FF595959" },
  EVIDENCE_RETRIEVAL_FAILED: { fill: "FFFFC7CE", font: "FF9C0006" },
  NEEDS_HUMAN_REVIEW: { fill: "FFFFEB9C", font: "FF9C6500" },
};

const REQUIRES_ACTION_COLORS = {
  YES: { fill: "FFFFC7CE", font: "FF9C0006" },
  NO: { fill: "FFC6EFCE", font: "FF006100" },
};

function formatReviewerEvidence(reviews: ReviewRecord[]): string {
  if (reviews.length === 0) return "No reviews found";
  return reviews.map((review) => `${review.reviewer}: ${review.state}`).join("\n");
}

function addLabeledRow(sheet: ExcelJS.Worksheet, label: string, value: string | number): ExcelJS.Row {
  const row = sheet.addRow([label, value]);
  row.getCell(1).font = { bold: true };
  return row;
}

function buildEvidenceSummarySheet(
  workbook: ExcelJS.Workbook,
  pullRequests: ClassifiedPullRequest[],
  meta: EvidencePackMeta,
): void {
  const sheet = workbook.addWorksheet(EVIDENCE_SUMMARY_SHEET);
  sheet.columns = [{ width: 34 }, { width: 60 }];

  const titleRow = sheet.addRow(["Vouqis Verify — AI Change Evidence Pack"]);
  titleRow.getCell(1).font = { bold: true, size: 16 };
  sheet.mergeCells(titleRow.number, 1, titleRow.number, 2);
  sheet.addRow([]);

  const summary = summarize(pullRequests);

  addLabeledRow(sheet, "Repository", `${meta.owner}/${meta.repo}`);
  addLabeledRow(sheet, "Pack Generated (UTC)", `${meta.generatedAt} UTC`);
  addLabeledRow(sheet, "Selected From Date", meta.from);
  addLabeledRow(sheet, "Selected To Date", meta.to);
  addLabeledRow(sheet, "Source", "Read-only GitHub App");
  sheet.addRow([]);

  addLabeledRow(sheet, "Total Merged PRs Reviewed", summary.totalPRs);
  addLabeledRow(sheet, "Total AI-Sensitive PRs", summary.aiSensitivePRs);
  addLabeledRow(sheet, "Total Needs Human Review PRs", summary.manualReviewPRs);
  sheet.addRow([]);

  addLabeledRow(sheet, "Checks Passed", summary.evidenceStatusTotals.CHECKS_PASSED);
  addLabeledRow(sheet, "Checks Failed", summary.evidenceStatusTotals.CHECKS_FAILED);
  addLabeledRow(sheet, "No Checks Found", summary.evidenceStatusTotals.NO_CHECKS_FOUND);
  addLabeledRow(sheet, "Evidence Retrieval Failed", summary.evidenceStatusTotals.EVIDENCE_RETRIEVAL_FAILED);
  const needsHumanReviewRow = addLabeledRow(
    sheet,
    EVIDENCE_STATUS_LABELS.NEEDS_HUMAN_REVIEW,
    summary.evidenceStatusTotals.NEEDS_HUMAN_REVIEW,
  );
  const needsHumanReviewColors = EVIDENCE_STATUS_COLORS.NEEDS_HUMAN_REVIEW;
  needsHumanReviewRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: needsHumanReviewColors.fill } };
  needsHumanReviewRow.getCell(2).font = { color: { argb: needsHumanReviewColors.font }, bold: true };
  sheet.addRow([]);

  const categoryHeaderRow = sheet.addRow(["Category Totals"]);
  categoryHeaderRow.getCell(1).font = { bold: true, italic: true };

  addLabeledRow(sheet, CATEGORY_LABELS.PROMPT, summary.categoryTotals.PROMPT);
  addLabeledRow(sheet, CATEGORY_LABELS.MODEL_CONFIGURATION, summary.categoryTotals.MODEL_CONFIGURATION);
  addLabeledRow(sheet, CATEGORY_LABELS.RETRIEVAL_ACCESS, summary.categoryTotals.RETRIEVAL_ACCESS);
  addLabeledRow(sheet, CATEGORY_LABELS.TOOL_PERMISSION, summary.categoryTotals.TOOL_PERMISSION);
  addLabeledRow(sheet, CATEGORY_LABELS.NEEDS_HUMAN_REVIEW, summary.categoryTotals.NEEDS_HUMAN_REVIEW);
  addLabeledRow(sheet, CATEGORY_LABELS.NONE, summary.categoryTotals.NONE);
  sheet.addRow([]);

  const distinctionRow = sheet.addRow([REVIEW_DISTINCTION_NOTE]);
  distinctionRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
  sheet.mergeCells(distinctionRow.number, 1, distinctionRow.number, 2);
  distinctionRow.height = 36;
  sheet.addRow([]);

  const disclaimerRow = sheet.addRow([DISCLAIMER]);
  disclaimerRow.getCell(1).font = { italic: true };
  disclaimerRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
  sheet.mergeCells(disclaimerRow.number, 1, disclaimerRow.number, 2);
  disclaimerRow.height = 45;
}

interface PrEvidenceColumn {
  name: string;
  width: number;
  wrap?: boolean;
}

const PR_EVIDENCE_COLUMNS: PrEvidenceColumn[] = [
  { name: "PR Number", width: 10 },
  { name: "Pull Request", width: 14 },
  { name: "Title", width: 48, wrap: true },
  { name: "Author", width: 18 },
  { name: "Merged At", width: 14 },
  { name: "Changed Files", width: 42, wrap: true },
  { name: "AI Sensitive", width: 12 },
  { name: "AI Change Category", width: 22 },
  { name: "Classification Confidence", width: 16 },
  { name: "Classification Reason", width: 48, wrap: true },
  { name: "Reviewer Evidence", width: 32, wrap: true },
  { name: "Evidence Status", width: 38 },
  { name: "Check Summary", width: 32 },
  { name: "Requires Action", width: 26 },
];

const EVIDENCE_STATUS_COLUMN_INDEX = 12;
const REQUIRES_ACTION_COLUMN_INDEX = 14;

function buildPrEvidenceRowValues(pr: ClassifiedPullRequest): unknown[] {
  const requiresAction = computeRequiresAction(pr);
  return [
    pr.number,
    { text: `#${pr.number}`, hyperlink: pr.url },
    pr.title,
    pr.author,
    pr.mergedAt,
    pr.changedFiles.length > 0 ? pr.changedFiles.join("\n") : "(no changed files reported)",
    isAiSensitive(pr.classification.category) ? "YES" : "NO",
    CATEGORY_LABELS[pr.classification.category],
    pr.classification.confidence,
    pr.classification.reason,
    formatReviewerEvidence(pr.reviews),
    EVIDENCE_STATUS_LABELS[pr.evidence.status],
    pr.evidence.summary,
    requiresAction.label,
  ];
}

function buildPrEvidenceSheet(workbook: ExcelJS.Workbook, pullRequests: ClassifiedPullRequest[]): void {
  const sheet = workbook.addWorksheet(PR_EVIDENCE_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });

  sheet.addTable({
    name: "PREvidenceTable",
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium9", showRowStripes: true },
    columns: PR_EVIDENCE_COLUMNS.map((col) => ({ name: col.name, filterButton: true })),
    rows: pullRequests.map(buildPrEvidenceRowValues),
  });

  PR_EVIDENCE_COLUMNS.forEach((col, index) => {
    sheet.getColumn(index + 1).width = col.width;
  });

  pullRequests.forEach((pr, rowOffset) => {
    const row = sheet.getRow(rowOffset + 2); // +1 for 1-based, +1 to skip the header row

    PR_EVIDENCE_COLUMNS.forEach((col, index) => {
      if (col.wrap) {
        row.getCell(index + 1).alignment = { wrapText: true, vertical: "top" };
      }
    });

    const statusColors = EVIDENCE_STATUS_COLORS[pr.evidence.status];
    const statusCell = row.getCell(EVIDENCE_STATUS_COLUMN_INDEX);
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusColors.fill } };
    statusCell.font = { color: { argb: statusColors.font }, bold: true };

    const requiresActionLabel = computeRequiresAction(pr).label;
    const actionColors = requiresActionLabel.startsWith("YES") ? REQUIRES_ACTION_COLORS.YES : REQUIRES_ACTION_COLORS.NO;
    const actionCell = row.getCell(REQUIRES_ACTION_COLUMN_INDEX);
    actionCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: actionColors.fill } };
    actionCell.font = { color: { argb: actionColors.font }, bold: true };
  });
}

const VERIFICATION_DETAIL_HEADERS = [
  "PR Number",
  "PR URL",
  "Check Name",
  "Check Type",
  "Status",
  "Conclusion",
  "Check URL",
  "Reviewer",
  "Review State",
  "Recorded At",
];

function hyperlinkCell(url: string): { text: string; hyperlink: string } {
  return { text: url, hyperlink: url };
}

function buildVerificationRows(pr: ClassifiedPullRequest): unknown[][] {
  const rows: unknown[][] = [];
  const prUrlCell = hyperlinkCell(pr.url);

  for (const check of pr.checkRuns) {
    rows.push([
      pr.number,
      prUrlCell,
      check.name,
      "CHECK_RUN",
      check.status,
      check.conclusion ?? "",
      check.url ? hyperlinkCell(check.url) : "",
      "",
      "",
      check.recordedAt ?? "",
    ]);
  }

  for (const status of pr.commitStatuses) {
    rows.push([
      pr.number,
      prUrlCell,
      status.name,
      "STATUS",
      "",
      status.state,
      status.url ? hyperlinkCell(status.url) : "",
      "",
      "",
      status.recordedAt ?? "",
    ]);
  }

  for (const review of pr.reviews) {
    rows.push([pr.number, prUrlCell, "", "REVIEW", "", "", "", review.reviewer, review.state, review.recordedAt ?? ""]);
  }

  if (pr.evidence.status === "NO_CHECKS_FOUND") {
    rows.push([pr.number, prUrlCell, "", "NONE", "NO_CHECKS_FOUND", "", "", "", "", ""]);
  }

  if (pr.evidence.status === "EVIDENCE_RETRIEVAL_FAILED") {
    rows.push([pr.number, prUrlCell, "", "NONE", "EVIDENCE_RETRIEVAL_FAILED", pr.evidence.summary, "", "", "", ""]);
  }

  return rows;
}

function buildVerificationDetailSheet(workbook: ExcelJS.Workbook, pullRequests: ClassifiedPullRequest[]): void {
  const sheet = workbook.addWorksheet(VERIFICATION_DETAIL_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "PR Number", key: "prNumber", width: 10 },
    { header: "PR URL", key: "prUrl", width: 40 },
    { header: "Check Name", key: "checkName", width: 30 },
    { header: "Check Type", key: "checkType", width: 14 },
    { header: "Status", key: "status", width: 20 },
    { header: "Conclusion", key: "conclusion", width: 30 },
    { header: "Check URL", key: "checkUrl", width: 40 },
    { header: "Reviewer", key: "reviewer", width: 20 },
    { header: "Review State", key: "reviewState", width: 18 },
    { header: "Recorded At", key: "recordedAt", width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: VERIFICATION_DETAIL_HEADERS.length } };

  for (const pr of pullRequests) {
    for (const row of buildVerificationRows(pr)) {
      sheet.addRow(row);
    }
  }
}

export function buildEvidenceWorkbook(
  pullRequests: ClassifiedPullRequest[],
  meta: EvidencePackMeta,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Vouqis Verify";
  workbook.created = new Date(meta.generatedAt);

  buildEvidenceSummarySheet(workbook, pullRequests, meta);
  buildPrEvidenceSheet(workbook, pullRequests);
  buildVerificationDetailSheet(workbook, pullRequests);

  return workbook;
}

export function buildEvidenceWorkbookFilename(meta: Pick<EvidencePackMeta, "owner" | "repo" | "from" | "to">): string {
  return buildEvidencePackFilename(meta, "xlsx");
}
