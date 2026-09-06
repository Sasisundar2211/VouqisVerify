"use client";

import { useState } from "react";
import type { EvidencePackMeta } from "@/lib/vouqis/csv";
import { downloadBlob } from "@/lib/vouqis/download";
import { buildEvidenceWorkbookFilename } from "@/lib/vouqis/excel";
import type { ClassifiedPullRequest } from "@/lib/vouqis/types";

export function DownloadExcelButton({
  pullRequests,
  meta,
  onError,
}: {
  pullRequests: ClassifiedPullRequest[];
  meta: EvidencePackMeta;
  onError: (message: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch("/api/github/evidence-pack/xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pullRequests, meta }),
      });
      if (!res.ok) {
        onError("Could not generate the Excel evidence pack. Please try again.");
        return;
      }
      const blob = await res.blob();
      downloadBlob(blob, buildEvidenceWorkbookFilename(meta));
    } catch {
      onError("Could not generate the Excel evidence pack. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={pullRequests.length === 0 || downloading}
      className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-[#ccc]"
    >
      {downloading ? "Generating…" : "Download Excel Evidence Pack"}
    </button>
  );
}
