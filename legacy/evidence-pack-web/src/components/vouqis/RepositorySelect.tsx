import type { Repository } from "@/lib/github/pulls";

export function RepositorySelect({
  repositories,
  value,
  onChange,
}: {
  repositories: Repository[];
  value: string | null;
  onChange: (fullName: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-500 dark:text-zinc-400">Repository</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-black/15 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5"
      >
        <option value="" disabled>
          Select a repository…
        </option>
        {repositories.map((repo) => (
          <option key={repo.fullName} value={repo.fullName}>
            {repo.fullName}
          </option>
        ))}
      </select>
    </label>
  );
}
