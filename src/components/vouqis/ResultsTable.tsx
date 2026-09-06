import { CATEGORY_LABELS, type Category, type ClassifiedPullRequest, type EvidenceStatus } from "@/lib/vouqis/types";

const CATEGORY_STYLES: Record<Category, string> = {
  PROMPT: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  MODEL_CONFIGURATION: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  RETRIEVAL_ACCESS: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  TOOL_PERMISSION: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  NONE: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  NEEDS_HUMAN_REVIEW: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

// NO_CHECKS_FOUND and EVIDENCE_RETRIEVAL_FAILED must never read as a pass —
// they get the same "unresolved" red/amber treatment as a failure, not green.
const EVIDENCE_STYLES: Record<EvidenceStatus, string> = {
  CHECKS_PASSED: "text-green-700 dark:text-green-400",
  CHECKS_FAILED: "text-red-700 dark:text-red-400",
  NO_CHECKS_FOUND: "text-zinc-500 dark:text-zinc-400",
  EVIDENCE_RETRIEVAL_FAILED: "text-red-700 dark:text-red-400",
  NEEDS_HUMAN_REVIEW: "text-amber-700 dark:text-amber-400",
};

function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_STYLES[category]}`}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export function ResultsTable({
  pullRequests,
  emptyMessage,
}: {
  pullRequests: ClassifiedPullRequest[];
  emptyMessage: string;
}) {
  if (pullRequests.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/15 p-8 text-center text-sm text-zinc-500 dark:border-white/15 dark:text-zinc-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-black/[.03] dark:bg-white/[.05]">
          <tr>
            <th className="px-3 py-2 font-medium">PR</th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Merged</th>
            <th className="px-3 py-2 font-medium">Changed files</th>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium">Confidence / reason</th>
            <th className="px-3 py-2 font-medium">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {pullRequests.map((pr) => (
            <tr key={pr.number} className="border-t border-black/10 align-top dark:border-white/10">
              <td className="px-3 py-2 whitespace-nowrap">
                <a href={pr.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                  #{pr.number}
                </a>
              </td>
              <td className="px-3 py-2">{pr.title}</td>
              <td className="px-3 py-2 whitespace-nowrap">{pr.mergedAt}</td>
              <td className="px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                {pr.changedFiles.join(", ")}
              </td>
              <td className="px-3 py-2">
                <CategoryBadge category={pr.classification.category} />
              </td>
              <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{pr.classification.confidence}</span>
                {" — "}
                {pr.classification.reason}
              </td>
              <td className={`px-3 py-2 font-medium whitespace-nowrap ${EVIDENCE_STYLES[pr.evidence.status]}`}>
                {pr.evidence.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
