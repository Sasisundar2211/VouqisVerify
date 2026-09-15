// Pure CSV formatting for the AI Change Evidence Pack export. No DOM/browser
// APIs here so it stays unit-testable; triggering the actual file download is
// a UI concern (see DownloadCsvButton).
//
// Format rules (all required, not optional):
// - UTF-8 BOM prefix
// - CRLF row endings
// - every field wrapped in double quotes, internal quotes doubled
// - one row per PR, with the pack-level metadata repeated on every row so
//   each row is self-contained for downstream audit tooling.

import { computeRequiresAction } from "./requiresAction";
import { sanitizeForSpreadsheet } from "./spreadsheetSafety";
import { isAiSensitive, type ClassifiedPullRequest } from "./types";

export interface EvidencePackMeta {
  owner: string;
  repo: string;
  /** ISO 8601 datetime the pack was generated. */
  generatedAt: string;
  /** Inclusive ISO date (YYYY-MM-DD). */
  from: string;
  /** Inclusive ISO date (YYYY-MM-DD). */
  to: string;
}

export const EVIDENCE_PACK_DISCLAIMER =
  "This pack documents identified AI-relevant code changes and associated GitHub review and " +
  "verification evidence. It is not a statement that the AI system is safe, compliant, or approved by an auditor.";

const COLUMNS = [
  "Repository",
  "Evidence Pack Generated At",
  "Date Range From",
  "Date Range To",
  "PR Number",
  "PR URL",
  "PR Title",
  "Author",
  "Merged At",
  "Changed Files",
  "AI Sensitive",
  "AI Change Category",
  "Classification Confidence",
  "Classification Reason",
  "Evidence Status",
  "Check Run Summary",
  "Check Run Names",
  "Disclaimer",
  "Requires Action",
] as const;

function quoteField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function toRow(pr: ClassifiedPullRequest, meta: EvidencePackMeta): string[] {
  return [
    `${meta.owner}/${meta.repo}`,
    meta.generatedAt,
    meta.from,
    meta.to,
    String(pr.number),
    pr.url,
    sanitizeForSpreadsheet(pr.title),
    sanitizeForSpreadsheet(pr.author),
    pr.mergedAt,
    pr.changedFiles.map(sanitizeForSpreadsheet).join("; "),
    String(isAiSensitive(pr.classification.category)),
    pr.classification.category,
    pr.classification.confidence,
    pr.classification.reason,
    pr.evidence.status,
    sanitizeForSpreadsheet(pr.evidence.summary),
    pr.evidence.checkNames.map(sanitizeForSpreadsheet).join("; "),
    EVIDENCE_PACK_DISCLAIMER,
    computeRequiresAction(pr).label,
  ];
}

/**
 * Builds the full CSV text for exactly the given (already-filtered) PRs.
 * Callers must pass only the rows currently displayed — this function does
 * no filtering of its own.
 */
export function buildEvidenceCsv(pullRequests: ClassifiedPullRequest[], meta: EvidencePackMeta): string {
  const lines = [COLUMNS.map(quoteField).join(",")];
  for (const pr of pullRequests) {
    lines.push(toRow(pr, meta).map(quoteField).join(","));
  }
  return "﻿" + lines.join("\r\n");
}

export function buildEvidencePackFilename(
  meta: Pick<EvidencePackMeta, "owner" | "repo" | "from" | "to">,
  extension: "csv" | "xlsx",
): string {
  return `vouqis-evidence-pack-${meta.owner}-${meta.repo}-${meta.from}-to-${meta.to}.${extension}`;
}

export function buildEvidenceCsvFilename(meta: Pick<EvidencePackMeta, "owner" | "repo" | "from" | "to">): string {
  return buildEvidencePackFilename(meta, "csv");
}
