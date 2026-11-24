"use client";

import { useEffect, useState } from "react";
import { SummaryCards } from "@/components/vouqis/SummaryCards";
import { DateRangeControls } from "@/components/vouqis/DateRangeControls";
import { ResultsTable } from "@/components/vouqis/ResultsTable";
import { DownloadCsvButton } from "@/components/vouqis/DownloadCsvButton";
import { DownloadExcelButton } from "@/components/vouqis/DownloadExcelButton";
import { ConnectGitHubButton } from "@/components/vouqis/ConnectGitHubButton";
import { RepositorySelect } from "@/components/vouqis/RepositorySelect";
import type { Repository } from "@/lib/github/pulls";
import type { EvidencePackMeta } from "@/lib/vouqis/csv";
import { isValidDateRange, getResultsEmptyMessage, summarize, ZERO_SUMMARY, type DateRange } from "@/lib/vouqis/filters";
import type { ClassifiedPullRequest } from "@/lib/vouqis/types";

type Session = { connected: false } | { connected: true; accountLogin: string };

const DEFAULT_RANGE: DateRange = {
  from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  to: new Date().toISOString().slice(0, 10),
};

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [pullRequests, setPullRequests] = useState<ClassifiedPullRequest[]>([]);
  const [meta, setMeta] = useState<EvidencePackMeta | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  useEffect(() => {
    fetch("/api/github/session")
      .then((res) => res.json())
      .then(setSession)
      .catch(() => setSession({ connected: false }));
  }, []);

  useEffect(() => {
    if (session?.connected) {
      fetch("/api/github/repositories")
        .then((res) => res.json())
        .then((data) => {
          if (data.error) setError(data.error);
          else setRepositories(data.repositories);
        })
        .catch(() => setError("Could not load repositories. Please try again."));
    }
  }, [session]);

  const rangeError = isValidDateRange(range) ? null : "The start date must be on or before the end date.";

  async function handleDisconnect() {
    await fetch("/api/github/session", { method: "DELETE" });
    setSession({ connected: false });
    setRepositories([]);
    setSelectedRepo(null);
    setPullRequests([]);
    setMeta(null);
    setHasGenerated(false);
  }

  async function handleGenerate() {
    if (!selectedRepo || rangeError) return;
    const [owner, repo] = selectedRepo.split("/");
    setGenerating(true);
    setError(null);
    setDownloadError(null);
    try {
      const params = new URLSearchParams({ owner, repo, from: range.from, to: range.to });
      const res = await fetch(`/api/github/evidence-pack?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setPullRequests([]);
        setMeta(null);
      } else {
        setPullRequests(data.pullRequests);
        setMeta(data.meta);
      }
      setHasGenerated(true);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  const summary = summarize(pullRequests);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Vouqis Verify</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            AI Change Evidence Pack — live, read-only GitHub data
          </p>
        </div>
        {session?.connected && (
          <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
            <span>Connected as {session.accountLogin}</span>
            <button type="button" onClick={handleDisconnect} className="underline">
              Disconnect
            </button>
          </div>
        )}
      </header>

      {session === null && <p className="text-sm text-zinc-500 dark:text-zinc-400">Checking GitHub connection…</p>}

      {session?.connected === false && (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-black/15 p-8 dark:border-white/15">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Connect a GitHub repository to generate an AI Change Evidence Pack.
          </p>
          <ConnectGitHubButton />
        </div>
      )}

      {session?.connected && (
        <>
          <SummaryCards summary={hasGenerated ? summary : ZERO_SUMMARY} />

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <RepositorySelect repositories={repositories} value={selectedRepo} onChange={setSelectedRepo} />
              <DateRangeControls range={range} onChange={setRange} error={rangeError} />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!selectedRepo || !!rangeError || generating}
                className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-[#ccc]"
              >
                {generating ? "Generating…" : "Generate evidence pack"}
              </button>
            </div>
            {meta && (
              <div className="flex items-center gap-3">
                <DownloadExcelButton pullRequests={pullRequests} meta={meta} onError={setDownloadError} />
                <DownloadCsvButton pullRequests={pullRequests} meta={meta} onError={setDownloadError} />
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          {downloadError && (
            <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
              {downloadError}
            </p>
          )}

          <ResultsTable
            pullRequests={rangeError ? [] : pullRequests}
            emptyMessage={getResultsEmptyMessage(hasGenerated)}
          />
        </>
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        This pack documents identified AI-relevant code changes and associated GitHub review and
        verification evidence. It is not a statement that the AI system is safe, compliant, or
        approved by an auditor.
      </p>
    </div>
  );
}
