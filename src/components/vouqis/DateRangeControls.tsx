import type { DateRange } from "@/lib/vouqis/filters";

export function DateRangeControls({
  range,
  onChange,
  error,
}: {
  range: DateRange;
  onChange: (range: DateRange) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">From</span>
        <input
          type="date"
          value={range.from}
          onChange={(e) => onChange({ ...range, from: e.target.value })}
          className="rounded-md border border-black/15 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">To</span>
        <input
          type="date"
          value={range.to}
          onChange={(e) => onChange({ ...range, to: e.target.value })}
          className="rounded-md border border-black/15 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
