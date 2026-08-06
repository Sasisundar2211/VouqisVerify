import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Changelog — Vouqis',
  description: 'Version history for Vouqis Verify, the AI change verification CLI.',
}

type ChangeType = 'feat' | 'fix' | 'refactor' | 'chore'

type Change = {
  type: ChangeType
  text: string
}

type Release = {
  version: string
  date: string
  summary: string
  changes: Change[]
}

const RELEASES: Release[] = [
  {
    version: 'v0.1.3',
    date: '2026-07-01',
    summary: 'doctor command added; baseline comparison now includes previous run score.',
    changes: [
      { type: 'feat', text: 'vouqis doctor checks config validity, eval script path, and GitHub token before CI runs.' },
      { type: 'feat', text: 'Baseline score from the last passing run is included in the PR comment delta row.' },
      { type: 'fix', text: 'vouqis verify now exits non-zero on BLOCK_MERGE verdict so GitHub Actions marks the step as failed.' },
      { type: 'chore', text: 'Restore scroll position to top on every page load via inline head script.' },
    ],
  },
  {
    version: 'v0.1.2',
    date: '2026-06-18',
    summary: 'PR comment posting via GitHub API; MERGE_WITH_WARNING verdict introduced.',
    changes: [
      { type: 'feat', text: 'Post formatted verdict comment to pull request via GitHub REST API on every verify run.' },
      { type: 'feat', text: 'MERGE_WITH_WARNING verdict fires when score passes threshold but regresses from baseline.' },
      { type: 'feat', text: 'report.block_on_fail config key controls whether a failing check blocks the merge button.' },
      { type: 'fix', text: 'Score key lookup now raises a clear error when score_key is missing from eval output JSON.' },
    ],
  },
  {
    version: 'v0.1.1',
    date: '2026-06-05',
    summary: 'Config validation hardening; ai_paths glob support.',
    changes: [
      { type: 'feat', text: 'ai_paths entries now support glob patterns (e.g. src/agents/**/*.py).' },
      { type: 'fix', text: 'vouqis init validates that the eval script path exists before writing vouqis.yml.' },
      { type: 'refactor', text: 'Config loading extracted into its own module with typed schema validation.' },
      { type: 'chore', text: 'pytest added to CI; config loader and verdict logic covered.' },
    ],
  },
  {
    version: 'v0.1.0',
    date: '2026-05-22',
    summary: 'First public release. AI path detection, eval runner, three-verdict engine.',
    changes: [
      { type: 'feat', text: 'vouqis verify detects changed files against ai_paths and skips runs on non-AI PRs.' },
      { type: 'feat', text: 'Eval runner executes any shell command and reads score from JSON stdout.' },
      { type: 'feat', text: 'BLOCK_MERGE and SAFE_TO_MERGE verdicts based on configurable threshold.' },
      { type: 'feat', text: 'vouqis.yml config with ai_paths, eval.run, eval.score_key, eval.threshold.' },
      { type: 'feat', text: 'vouqis init interactive setup generates vouqis.yml from prompts.' },
    ],
  },
]

const TYPE_COLORS: Record<ChangeType, string> = {
  feat: '#7FCB9F',
  fix: 'var(--color-block)',
  refactor: 'var(--color-warn)',
  chore: 'var(--color-fg-tertiary)',
}

export default function ChangelogPage() {
  return (
    <div
      style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: 'clamp(56px,8vw,104px) clamp(20px,5vw,72px)',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 'clamp(56px,7vw,88px)' }}>
        <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-fg-secondary">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-purple)' }} />
          Changelog
        </p>
        <h1 className="text-[clamp(38px,5vw,66px)] leading-[1.02] text-fg">Version history</h1>
        <p className="mt-[18px] max-w-[52ch] text-[clamp(15px,1.1vw,17.5px)] leading-[1.65] text-fg-secondary">
          Every release of <code className="font-mono text-[0.9em]">vouqis-verify</code>. Unreleased
          changes are on{' '}
          <a
            href="https://github.com/Sasisundar2211/VouqisVerify"
            target="_blank"
            rel="noopener noreferrer"
            className="vq-text-link"
          >
            GitHub
          </a>
          .
        </p>
      </div>

      {/* Releases */}
      {RELEASES.map((release, i) => (
        <div
          key={release.version}
          className="border-border-strong"
          style={{
            paddingBottom: 'clamp(40px,5vw,64px)',
            marginBottom: 'clamp(40px,5vw,64px)',
            borderBottomWidth: i < RELEASES.length - 1 ? 1 : 0,
            borderBottomStyle: 'solid',
          }}
        >
          <div className="mb-3.5 flex flex-wrap items-baseline gap-4">
            <span className="font-mono text-[clamp(18px,2vw,24px)] font-semibold text-fg">{release.version}</span>
            <span className="font-mono text-xs tracking-wide text-fg-quaternary">{release.date}</span>
          </div>

          <p className="mb-[22px] max-w-[56ch] text-[15.5px] leading-[1.6] text-fg-secondary">{release.summary}</p>

          <div className="flex flex-col">
            {release.changes.map((change, j) => (
              <div
                key={j}
                className="flex items-baseline gap-3 border-border py-2"
                style={{
                  borderTopWidth: j === 0 ? 1 : 0,
                  borderTopStyle: 'solid',
                  borderBottomWidth: 1,
                  borderBottomStyle: 'solid',
                }}
              >
                <span
                  className="w-[54px] shrink-0 font-mono text-[10.5px] tracking-wide"
                  style={{ color: TYPE_COLORS[change.type] }}
                >
                  {change.type}
                </span>
                <span className="text-[14.5px] leading-[1.55] text-fg-secondary">{change.text}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
