import { AI_CATEGORIES, CATEGORY_LABELS } from "@/lib/vouqis/types";
import type { Summary } from "@/lib/vouqis/filters";

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export function SummaryCards({ summary }: { summary: Summary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card label="PRs reviewed" value={summary.totalPRs} />
      <Card label="AI-sensitive PRs" value={summary.aiSensitivePRs} />
      <Card label="Needs manual review" value={summary.manualReviewPRs} />
      <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">By category</p>
        <ul className="mt-1 space-y-0.5 text-sm">
          {AI_CATEGORIES.map((category) => (
            <li key={category} className="flex justify-between gap-4">
              <span className="text-zinc-600 dark:text-zinc-300">{CATEGORY_LABELS[category]}</span>
              <span className="font-medium">{summary.categoryTotals[category]}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
