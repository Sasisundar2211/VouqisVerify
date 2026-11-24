import { buildEvidenceCsv, buildEvidenceCsvFilename, type EvidencePackMeta } from "@/lib/vouqis/csv";
import { downloadBlob } from "@/lib/vouqis/download";
import type { ClassifiedPullRequest } from "@/lib/vouqis/types";

export function DownloadCsvButton({
  pullRequests,
  meta,
  onError,
}: {
  pullRequests: ClassifiedPullRequest[];
  meta: EvidencePackMeta;
  onError: (message: string) => void;
}) {
  function handleDownload() {
    try {
      const csv = buildEvidenceCsv(pullRequests, meta);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      downloadBlob(blob, buildEvidenceCsvFilename(meta));
    } catch {
      onError("Could not generate the CSV file. Please try again.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={pullRequests.length === 0}
      className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/5"
    >
      Download Raw CSV
    </button>
  );
}
