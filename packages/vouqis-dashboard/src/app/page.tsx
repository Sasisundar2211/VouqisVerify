'use client'

import { useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  GitPullRequest,
  Terminal,
  ShieldCheck,
} from 'lucide-react'

const REPO_URL = 'https://github.com/Sasisundar2211/Vouqis-Verify'

const INFRA_BADGES = ['Free Open Source (MIT)', 'GitHub Action', 'Python CLI']

const MONITORS = [
  'Prompts (.txt/.json)',
  'System Messages',
  'RAG Weights',
  'Agent Tool Schemas',
  'MCP Server Configs',
]

const INTEGRATIONS = [
  'GitHub Actions',
  'Pytest Runner',
  'Promptfoo Spec',
  'Braintrust Logs',
  'LangSmith Tracing',
]

const PROCESS_STEPS = [
  {
    n: '01',
    title: 'PR is Opened',
    body: 'Developer pushes a branch modifying code or LLM prompt structures.',
  },
  {
    n: '02',
    title: 'Vouqis Action Triggers',
    body: 'The native CLI automatically isolates the changed repository files during the ephemeral runtime wrapper.',
  },
  {
    n: '03',
    title: 'Evaluations Run',
    body: 'Vouqis fires your specified testing suite inside your secure isolated container environment.',
  },
  {
    n: '04',
    title: 'Evidence Delivered',
    body: 'A structured Review Package Summary markdown string is pinned directly onto the GitHub PR timeline for human engineering review.',
  },
]

const USE_CASES = [
  {
    title: 'Prompt Engineering Teams',
    body: 'Tracks version drift and model behavior regressions before code merge.',
  },
  {
    title: 'RAG Architects',
    body: 'Monitors retrieval index tweaks, top-k changes, and semantic embedding alignment shifts.',
  },
  {
    title: 'Agentic Workflows',
    body: 'Exposes modifications to tool schemas and function-calling parameters that trigger loops.',
  },
  {
    title: 'Platform Teams',
    body: 'Enforces consistent code quality benchmarks across the entire development pipeline.',
  },
]

const TRIGGERS = [
  {
    title: 'Local pre-commit hook',
    body: 'Run vouqis-verify locally to catch syntax, schema, or prompt formatting errors before pushing code.',
  },
  {
    title: 'CI Pipeline Integration',
    body: 'Runs completely headless and automated on standard code pushes, branch protection steps, or pull request events.',
  },
]

const FAQ = [
  {
    q: 'Does Vouqis Verify store our proprietary prompts or source code?',
    a: 'No. Vouqis Verify processes your git diff statement entirely during the temporary runtime. It features zero-data retention, and data is never stored on external databases.',
  },
  {
    q: 'Do we need to switch from our existing testing framework?',
    a: 'No. Vouqis acts as an orchestration layer. It plugs directly into your current setup, whether you use pytest, Promptfoo, Braintrust, or custom internal test files.',
  },
  {
    q: 'Is it open source?',
    a: 'Yes. The Python CLI (vouqis-verify) and GitHub Action are completely open source under the MIT license.',
  },
]

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-orange-500">
      {children}
    </p>
  )
}

function EmailCaptureForm(): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    if (!email.includes('@')) return
    setStatus('loading')
    const localPart = email.split('@')[0] ?? ''
    const name = localPart.length >= 2 ? localPart : 'Beta signup'
    try {
      const res = await fetch('/api/design-partner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, why_now: 'Inline email capture' }),
      })
      setStatus(res.ok ? 'ok' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'ok') {
    return (
      <div className="flex items-center gap-2 font-mono text-sm text-zinc-50">
        <Check className="h-4 w-4 text-orange-500" />
        You&apos;re on the list — we&apos;ll be in touch.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col items-center gap-2">
      <div className="flex w-full flex-col gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-1 sm:flex-row sm:gap-0">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your engineering email"
          className="min-w-0 flex-1 rounded-md bg-transparent px-3 py-2 font-mono text-sm text-zinc-100 outline-none placeholder-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="group flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-orange-600 px-5 py-2 text-sm font-medium text-white transition-all hover:bg-orange-500 disabled:opacity-60"
        >
          {status === 'loading' ? 'Submitting…' : 'Join Beta'}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      </div>
      {status === 'error' && (
        <p className="font-mono text-xs text-red-400">Something went wrong — try again.</p>
      )}
    </form>
  )
}

function CiSimulator(): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-950 shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b border-zinc-800/60 bg-black px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-500/80" />
        <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
        <span className="h-3 w-3 rounded-full bg-green-500/80" />
        <span className="ml-3 font-mono text-xs text-zinc-500">vouqis-verify — pull_request #482</span>
      </div>

      <div className="grid gap-px bg-zinc-800/60 md:grid-cols-2">
        <div className="bg-zinc-950 p-5">
          <p className="mb-3 font-mono text-xs text-zinc-500">prompts/rag-template.txt</p>
          <div className="space-y-1 font-mono text-xs leading-relaxed">
            <div className="rounded bg-red-500/10 px-2 py-1 text-red-400">
              - context_window: top_k=3, temperature=0.2
            </div>
            <div className="rounded bg-green-500/10 px-2 py-1 text-green-400">
              + context_window: top_k=8, temperature=0.7
            </div>
          </div>
        </div>

        <div className="bg-zinc-950 p-5">
          <p className="mb-3 font-mono text-xs text-zinc-500">ephemeral runner</p>
          <div className="space-y-2 font-mono text-xs text-zinc-400">
            <p className="text-zinc-500">› 3 steps</p>
            <p className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-orange-500" />
              [02:14:01] Isolating prompt modifications…
            </p>
            <p className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-orange-500" />
              [02:14:03] Invoking local evaluation runner (Promptfoo)…
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-800/60 p-5">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="mb-2 flex items-center gap-2 font-mono text-sm font-medium text-orange-500">
            <AlertTriangle className="h-4 w-4" />
            HIGH_RISK: Semantic Drift Detected
          </div>
          <p className="text-sm text-zinc-400">
            Output tokens shifted significantly in test cases 4 and 9. Context window density
            dropped by 14%.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-md border border-zinc-700 px-4 py-2 font-mono text-xs text-zinc-300 transition-all duration-200 hover:border-orange-500 hover:text-orange-500"
          >
            Explore Complete Review Package Archive →
          </a>
        </div>
      </div>
    </div>
  )
}

function InteropColumn({
  title,
  items,
}: {
  title: string
  items: string[]
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-950 p-6">
      <h3 className="mb-5 text-sm font-medium text-zinc-50">{title}</h3>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="w-fit rounded-md border border-zinc-800/60 px-3 py-1.5 font-mono text-xs text-zinc-400 transition-all duration-200 hover:border-orange-500/50 hover:text-zinc-50"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function FaqSection(): React.JSX.Element {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  return (
    <div className="mt-8">
      {FAQ.map((item, i) => {
        const isOpen = activeIndex === i
        return (
          <div key={item.q} className="border-b border-zinc-800/60">
            <button
              onClick={() => setActiveIndex(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 py-5 text-left transition-all duration-200 hover:text-orange-500"
            >
              <span className="text-sm font-medium text-zinc-50">{item.q}</span>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-orange-500" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
              )}
            </button>
            <div
              className={`grid transition-all duration-200 ${isOpen ? 'grid-rows-[1fr] pb-5 opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
              style={{ display: 'grid' }}
            >
              <div className="overflow-hidden">
                <p className="text-sm leading-relaxed text-zinc-400">{item.a}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Home(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-black">
      {/* 1. Hero */}
      <section className="mx-auto flex max-w-5xl flex-col items-center px-6 py-28 text-center sm:py-36">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-zinc-50 sm:text-6xl">
          AI Change Verification Built for{' '}
          <span className="bg-gradient-to-r from-orange-500 to-orange-300 bg-clip-text text-transparent">
            GitHub Pull Requests.
          </span>
        </h1>
        <p className="mt-6 max-w-2xl text-base text-zinc-400 sm:text-lg">
          Traditional git diffs are blind to prompt, RAG, and agent shifts. Vouqis generates
          automated review packages exposing risk profiles directly inside your CI pipeline.
        </p>

        <div className="mt-10 flex justify-center">
          <EmailCaptureForm />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {INFRA_BADGES.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-zinc-800/60 px-3 py-1 font-mono text-xs text-zinc-400"
            >
              {badge}
            </span>
          ))}
        </div>
      </section>

      {/* 2. CI Simulator */}
      <section className="mx-auto max-w-4xl px-6 pb-28">
        <CiSimulator />
      </section>

      {/* 3. Interoperability Grid */}
      <section className="border-t border-zinc-800/60 bg-zinc-950/40 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Interoperability</SectionLabel>
          <h2 className="mb-12 max-w-xl text-2xl font-semibold text-zinc-50 sm:text-3xl">
            Plugs into what you already run.
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <InteropColumn title="Monitors Native Changes" items={MONITORS} />
            <InteropColumn title="Integrates with Your Stack" items={INTEGRATIONS} />
          </div>
        </div>
      </section>

      {/* 4. Process Architecture Walkthrough */}
      <section className="border-t border-zinc-800/60 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>How it works</SectionLabel>
          <h2 className="mb-12 max-w-xl text-2xl font-semibold text-zinc-50 sm:text-3xl">
            From push to evidence, automatically.
          </h2>
          <div className="grid gap-8 md:grid-cols-4">
            {PROCESS_STEPS.map((step, i) => (
              <div key={step.n} className="relative">
                <p className="font-mono text-3xl text-orange-500/40">{step.n}</p>
                <h3 className="mt-3 text-sm font-medium text-zinc-50">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.body}</p>
                {i < PROCESS_STEPS.length - 1 && (
                  <div className="absolute -right-4 top-4 hidden text-zinc-700 md:block">→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Domain Use-Case Matrix */}
      <section className="border-t border-zinc-800/60 bg-zinc-950/40 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Built for</SectionLabel>
          <h2 className="mb-12 max-w-xl text-2xl font-semibold text-zinc-50 sm:text-3xl">
            Every team touching the model layer.
          </h2>
          <div className="grid gap-px overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-800/60 sm:grid-cols-2">
            {USE_CASES.map((uc) => (
              <div
                key={uc.title}
                className="bg-black p-6 transition-all duration-200 hover:bg-zinc-950"
              >
                <h3 className="text-sm font-medium text-zinc-50">{uc.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{uc.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Git Alias Triggers */}
      <section className="border-t border-zinc-800/60 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Trigger contexts</SectionLabel>
          <h2 className="mb-12 max-w-xl text-2xl font-semibold text-zinc-50 sm:text-3xl">
            Runs locally or fully headless.
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {TRIGGERS.map((t, i) => (
              <div
                key={t.title}
                className="rounded-xl border border-zinc-800/60 p-6 transition-all duration-200 hover:border-orange-500/40"
              >
                {i === 0 ? (
                  <Terminal className="mb-4 h-5 w-5 text-orange-500" />
                ) : (
                  <GitPullRequest className="mb-4 h-5 w-5 text-orange-500" />
                )}
                <h3 className="text-sm font-medium text-zinc-50">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Security & Architecture FAQ */}
      <section className="border-t border-zinc-800/60 bg-zinc-950/40 px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <SectionLabel>Security &amp; architecture</SectionLabel>
          <h2 className="mb-4 flex items-center gap-3 text-2xl font-semibold text-zinc-50 sm:text-3xl">
            <ShieldCheck className="h-6 w-6 text-orange-500" />
            Zero-data retention, by design.
          </h2>
          <FaqSection />
        </div>
      </section>

      {/* Get early access — closing CTA + nav anchor target */}
      <section id="early-access" className="border-t border-zinc-800/60 px-6 py-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <h2 className="text-2xl font-semibold text-zinc-50 sm:text-3xl">Get early access.</h2>
          <p className="mt-4 max-w-xl text-sm text-zinc-400 sm:text-base">
            We&apos;re a small, early-stage open-source project shaping the spec with a handful
            of AI engineering teams. Join the beta and we&apos;ll set up vouqis.yml with you.
          </p>
          <div className="mt-8 flex justify-center">
            <EmailCaptureForm />
          </div>
        </div>
      </section>
    </div>
  )
}
