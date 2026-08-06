import type { Metadata } from 'next'
import { CopyButton } from '@/components/copy-button'
import { TerminalDemo } from '@/components/terminal-demo'

export const metadata: Metadata = {
  title: 'Docs — Vouqis',
  description: 'Vouqis Verify documentation: installation, quick start, verdicts, CLI reference, and configuration.',
}

const NAV = [
  { label: 'Getting Started', id: 'getting-started' },
  { label: 'Verdicts', id: 'verdicts' },
  { label: 'CLI Reference', id: 'cli-reference' },
  { label: 'Configuration', id: 'configuration' },
]

const VERDICTS = [
  {
    code: 'BLOCK_MERGE',
    label: 'Block Merge',
    color: 'var(--color-block)',
    bg: 'var(--color-block-bg)',
    desc: 'The eval score fell below the configured threshold. The PR comment is posted as a failing check. The merge button is blocked until the score improves or the threshold is explicitly overridden.',
  },
  {
    code: 'MERGE_WITH_WARNING',
    label: 'Merge With Warning',
    color: 'var(--color-warn)',
    bg: 'var(--color-warn-bg)',
    desc: 'The eval passed but the score dropped from the baseline. The PR is not blocked, but the comment flags the regression with the delta so the team can decide whether to proceed.',
  },
  {
    code: 'SAFE_TO_MERGE',
    label: 'Safe to Merge',
    color: 'var(--color-safe)',
    bg: 'var(--color-safe-bg)',
    desc: 'The eval score meets or exceeds the threshold and shows no regression from baseline. The PR comment shows the evidence and marks the check as passed.',
  },
]

const CLI_COMMANDS = [
  { cmd: 'vouqis init', desc: 'Create a vouqis.yml config file in the current directory. Prompts for eval script path and threshold.' },
  { cmd: 'vouqis verify', desc: 'Detect changed AI paths, run evals, compute the verdict, and post the result to the open PR.' },
  { cmd: 'vouqis doctor', desc: 'Check that the config file, eval script, and GitHub token are all valid before running in CI.' },
]

export default function DocsPage() {
  return (
    <div
      className="flex min-w-0 flex-col items-stretch md:flex-row md:items-start"
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: 'clamp(40px,6vw,80px) clamp(20px,5vw,72px)',
        gap: 'clamp(32px,6vw,80px)',
      }}
    >
      {/* Sidebar */}
      <nav
        aria-label="Documentation sections"
        className="flex min-w-0 w-full gap-1 overflow-x-auto pb-1 md:sticky md:top-[76px] md:block md:w-[180px] md:shrink-0 md:overflow-visible md:pb-0"
      >
        <div className="mb-3.5 hidden font-mono text-[10px] uppercase tracking-widest text-fg-tertiary md:block">
          Contents
        </div>
        {NAV.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="vq-pressable block shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 font-mono text-[12.5px] leading-[1.4] text-fg-secondary transition-colors hover:text-purple-text md:rounded-none md:border-0 md:border-l-2 md:px-0 md:pl-3 md:py-1.5"
            style={{ borderColor: 'var(--color-border-strong)' }}
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* Main content */}
      <main className="min-w-0 flex-1">
        {/* Getting Started */}
        <section id="getting-started" style={{ marginBottom: 'clamp(56px,7vw,96px)' }}>
          <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-fg-secondary">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-purple)' }} />
            Getting Started
          </p>
          <h1 className="mb-5 text-[clamp(34px,4vw,52px)] leading-[1.05] text-fg">What is Vouqis Verify?</h1>
          <p className="mb-8 max-w-[62ch] text-[clamp(15px,1.1vw,17.5px)] leading-[1.7] text-fg-secondary">
            Vouqis Verify is a CLI that runs your evals on every pull request that touches AI
            code, including prompts, evals, model config, and agent logic, and posts a clear
            verdict to the PR before your team merges.
          </p>
          <p className="mb-10 max-w-[62ch] text-[clamp(15px,1.1vw,17.5px)] leading-[1.7] text-fg-secondary">
            One GitHub Action step. No SDK changes. No infrastructure to run. Eval evidence on
            every merge.
          </p>

          <h2 className="mb-3 font-mono text-[13px] uppercase tracking-wide text-fg">Installation</h2>
          <CopyButton />

          <h2 className="mt-8 mb-4 font-mono text-[13px] uppercase tracking-wide text-fg">Quick Start</h2>
          <CodeBlock code={`vouqis init          # create vouqis.yml\nvouqis doctor        # verify config + GitHub token\nvouqis verify        # run evals and post to PR`} />

          <h2 className="mt-8 mb-4 font-mono text-[13px] uppercase tracking-wide text-fg">How it works</h2>
          <TerminalDemo />
        </section>

        {/* Verdicts */}
        <section
          id="verdicts"
          className="border-border-strong"
          style={{ marginBottom: 'clamp(56px,7vw,96px)', paddingTop: 'clamp(40px,5vw,64px)', borderTopWidth: 1, borderTopStyle: 'solid' }}
        >
          <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-fg-secondary">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-purple)' }} />
            Verdicts
          </p>
          <h2 className="mb-5 text-[clamp(28px,3.2vw,42px)] leading-[1.08] text-fg">
            Three outcomes. No ambiguity.
          </h2>
          <p className="mb-9 max-w-[58ch] text-[clamp(15px,1.1vw,17.5px)] leading-[1.7] text-fg-secondary">
            Every Vouqis run produces one of three verdicts. The verdict is posted as a GitHub
            check status so the merge button reflects the eval result automatically.
          </p>
          {VERDICTS.map((v) => (
            <div key={v.code} className="border-border-strong py-6" style={{ borderTopWidth: 1, borderTopStyle: 'solid' }}>
              <div className="mb-2 flex flex-wrap items-baseline gap-3">
                <code
                  className="rounded-sm px-2 py-[3px] font-mono text-xs tracking-wide"
                  style={{ color: v.color, background: v.bg }}
                >
                  {v.code}
                </code>
                <span className="text-base font-semibold text-fg">{v.label}</span>
              </div>
              <p className="max-w-[60ch] text-[14.5px] leading-[1.65] text-fg-secondary">{v.desc}</p>
            </div>
          ))}
          <div className="border-border-strong" style={{ borderTopWidth: 1, borderTopStyle: 'solid' }} />
        </section>

        {/* CLI Reference */}
        <section
          id="cli-reference"
          className="border-border-strong"
          style={{ marginBottom: 'clamp(56px,7vw,96px)', paddingTop: 'clamp(40px,5vw,64px)', borderTopWidth: 1, borderTopStyle: 'solid' }}
        >
          <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-fg-secondary">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-purple)' }} />
            CLI Reference
          </p>
          <h2 className="mb-7 text-[clamp(28px,3.2vw,42px)] leading-[1.08] text-fg">vouqis commands</h2>
          <div className="mt-1">
            {CLI_COMMANDS.map((c, i) => (
              <div
                key={c.cmd}
                className="flex flex-wrap gap-3 border-border-strong py-3.5"
                style={{ borderTopWidth: i === 0 ? 1 : 0, borderTopStyle: 'solid', borderBottomWidth: 1, borderBottomStyle: 'solid' }}
              >
                <code className="min-w-[180px] flex-none font-mono text-[12.5px] text-fg">{c.cmd}</code>
                <span className="flex-1 text-[14.5px] text-fg-secondary" style={{ minWidth: 200 }}>
                  {c.desc}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Configuration */}
        <section
          id="configuration"
          className="border-border-strong"
          style={{ paddingTop: 'clamp(40px,5vw,64px)', borderTopWidth: 1, borderTopStyle: 'solid' }}
        >
          <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-fg-secondary">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-purple)' }} />
            Configuration
          </p>
          <h2 className="mb-5 text-[clamp(28px,3.2vw,42px)] leading-[1.08] text-fg">vouqis.yml</h2>
          <p className="mb-6 max-w-[58ch] text-[clamp(15px,1.1vw,17.5px)] leading-[1.7] text-fg-secondary">
            Place <code className="font-mono text-[0.9em]">vouqis.yml</code> at the repository
            root. Run <code className="font-mono text-[0.9em]">vouqis init</code> to generate it
            interactively.
          </p>
          <CodeBlock code={`ai_paths:\n  - prompts/\n  - evals/\n  - src/agents/\n\neval:\n  run: python evals/run.py\n  score_key: accuracy\n  threshold: 0.80\n\nreport:\n  post_to_pr: true\n  block_on_fail: true`} />
          <p className="mt-4 max-w-[58ch] text-[14.5px] leading-[1.65] text-fg-secondary">
            <code className="font-mono text-[0.9em]">ai_paths</code> lists the directories Vouqis
            watches. A PR that touches none of these paths skips the eval entirely.{' '}
            <code className="font-mono text-[0.9em]">score_key</code> is the key Vouqis reads
            from your eval output JSON.
          </p>
        </section>
      </main>
    </div>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre
        className="overflow-x-auto rounded font-mono text-[13px] leading-[1.7] text-fg-secondary"
        style={{ background: 'var(--color-surface-elevated)', padding: '14px 18px', whiteSpace: 'pre' }}
      >
        {code}
      </pre>
      <div className="absolute top-2.5 right-2.5">
        <CopyButton text={code} />
      </div>
    </div>
  )
}
