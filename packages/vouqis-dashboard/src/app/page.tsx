'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  Check,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  GitPullRequest,
  Terminal,
  ShieldCheck,
} from 'lucide-react'
import { Container } from '@/components/ui/container'
import SectionLabel from '@/components/ui/section-label'
import { Reveal } from '@/components/ui/reveal'
import EmailForm from '@/components/ui/email-form'

const REPO_URL = 'https://github.com/Sasisundar2211/VouqisVerify'

const INFRA_BADGES = ['Free open source (MIT)', 'GitHub Action', 'Python CLI']

const MONITORS = [
  'Prompts (.txt/.json)',
  'System messages',
  'RAG weights',
  'Agent tool schemas',
  'MCP server configs',
]

const INTEGRATIONS = [
  'GitHub Actions',
  'Pytest runner',
  'Promptfoo spec',
  'Braintrust logs',
  'LangSmith tracing',
]

const PROCESS_STEPS = [
  {
    n: '01',
    title: 'PR is opened',
    body: 'Developer pushes a branch modifying code or LLM prompt structures.',
  },
  {
    n: '02',
    title: 'Vouqis action triggers',
    body: 'The native CLI automatically isolates the changed repository files during the ephemeral runtime wrapper.',
  },
  {
    n: '03',
    title: 'Evaluations run',
    body: 'Vouqis fires your specified testing suite inside your secure isolated container environment.',
  },
  {
    n: '04',
    title: 'Evidence delivered',
    body: 'A structured Review Package summary is pinned directly onto the GitHub PR timeline for human engineering review.',
  },
]

const USE_CASES = [
  {
    title: 'Prompt engineering teams',
    body: 'Tracks version drift and model behavior regressions before code merge.',
  },
  {
    title: 'RAG architects',
    body: 'Monitors retrieval index tweaks, top-k changes, and semantic embedding alignment shifts.',
  },
  {
    title: 'Agentic workflows',
    body: 'Exposes modifications to tool schemas and function-calling parameters that trigger loops.',
  },
  {
    title: 'Platform teams',
    body: 'Enforces consistent code quality benchmarks across the entire development pipeline.',
  },
]

const TRIGGERS = [
  {
    title: 'Local pre-commit hook',
    body: 'Run vouqis-verify locally to catch syntax, schema, or prompt formatting errors before pushing code.',
    icon: Terminal,
  },
  {
    title: 'CI pipeline integration',
    body: 'Runs completely headless and automated on standard code pushes, branch protection steps, or pull request events.',
    icon: GitPullRequest,
  },
]

const FAQ = [
  {
    q: 'Does Vouqis Verify store our proprietary prompts or source code?',
    a: 'No. Vouqis Verify processes your git diff statement entirely during the temporary runtime. It features zero data retention, and data is never stored on external databases.',
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

function CiSimulator(): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b border-border-strong bg-surface-alt px-4 py-3">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-purple)' }} />
        <span className="font-mono text-xs text-fg-tertiary">
          vouqis-verify &middot; pull_request #482
        </span>
      </div>

      <div className="grid gap-px bg-border-strong md:grid-cols-2">
        <div className="bg-surface p-5">
          <p className="mb-3 font-mono text-xs text-fg-tertiary">prompts/rag-template.txt</p>
          <div className="space-y-1 font-mono text-xs leading-relaxed">
            <div className="rounded px-2 py-1" style={{ background: 'rgba(217,91,91,0.1)', color: '#E48383' }}>
              - context_window: top_k=3, temperature=0.2
            </div>
            <div className="rounded px-2 py-1" style={{ background: 'rgba(105,185,141,0.1)', color: '#7FCB9F' }}>
              + context_window: top_k=8, temperature=0.7
            </div>
          </div>
        </div>

        <div className="bg-surface p-5">
          <p className="mb-3 font-mono text-xs text-fg-tertiary">ephemeral runner</p>
          <div className="space-y-2 font-mono text-xs text-fg-secondary">
            <p className="text-fg-tertiary">&rsaquo; 3 steps</p>
            <p className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5" style={{ color: 'var(--color-purple)' }} />
              [02:14:01] Isolating prompt modifications&hellip;
            </p>
            <p className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5" style={{ color: 'var(--color-purple)' }} />
              [02:14:03] Invoking local evaluation runner (Promptfoo)&hellip;
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-border-strong p-5">
        <div
          className="rounded-lg p-4"
          style={{ background: 'var(--color-warn-bg)', border: '1px solid rgba(201,169,110,0.25)' }}
        >
          <div className="mb-2 flex items-center gap-2 font-mono text-sm font-medium" style={{ color: 'var(--color-warn)' }}>
            <AlertTriangle className="h-4 w-4" />
            HIGH_RISK: Semantic drift detected
          </div>
          <p className="text-sm text-fg-secondary">
            Output tokens shifted significantly in test cases 4 and 9. Context window density
            dropped by 14 percent.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="vq-pressable vq-text-link mt-4 inline-block font-mono text-xs"
          >
            View full review package &rarr;
          </a>
        </div>
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
          <div key={item.q} className="border-b border-border-strong">
            <button
              onClick={() => setActiveIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="vq-pressable flex w-full items-center justify-between gap-4 py-5 text-left hover:text-purple-text"
            >
              <span className="text-sm font-medium text-fg">{item.q}</span>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0" style={{ color: 'var(--color-purple)' }} />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-fg-tertiary" />
              )}
            </button>
            <div
              className={`grid transition-all duration-300 ${isOpen ? 'grid-rows-[1fr] pb-5 opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
              style={{ display: 'grid' }}
            >
              <div className="overflow-hidden">
                <p className="text-sm leading-relaxed text-fg-secondary">{item.a}</p>
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
    <div>
      {/* 1. Hero */}
      <section className="overflow-x-clip pt-14 pb-16 sm:pt-20 sm:pb-20">
        <Container className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
          {/* Left: value proposition + CTA */}
          <div>
            <p className="mb-5 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-fg-secondary">
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-purple)' }} />
              AI change verification
            </p>
            <h1 className="max-w-xl text-4xl font-normal leading-[1.05] text-fg sm:text-5xl">
              Built for the moment before your team hits merge.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-fg-secondary sm:text-lg">
              Traditional git diffs are blind to prompt, RAG, and agent shifts. Vouqis generates
              automated review packages exposing risk profiles directly inside your CI pipeline.
            </p>

            <div className="mt-9">
              <EmailForm />
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {INFRA_BADGES.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-border-strong px-3 py-1 font-mono text-xs text-fg-tertiary"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>

          {/* Right: brand visual treatment */}
          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-10 rounded-full opacity-60 blur-3xl"
              style={{ background: 'radial-gradient(circle, rgba(123,61,255,0.25), transparent 70%)' }}
            />
            <div className="relative overflow-hidden rounded-2xl border border-border-strong bg-surface">
              <div className="flex flex-col items-center justify-center px-10 py-14">
                <Image
                  src="/vouqis-logo.jpg"
                  alt="Vouqis logo mark: a silver check inside a purple-to-violet check, symbolizing verified AI changes"
                  width={172}
                  height={200}
                  className="h-auto w-[136px] sm:w-[172px]"
                  priority
                />
              </div>
              <div className="flex items-center justify-between border-t border-border-strong px-6 py-4">
                <span className="font-mono text-xs text-fg-tertiary">vouqis / verify</span>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vq-pressable vq-text-link font-mono text-xs"
                >
                  Source on GitHub
                </a>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* 2. CI Simulator */}
      <Reveal>
        <section className="pb-24 sm:pb-28">
          <Container style={{ maxWidth: 1000 }}>
            <CiSimulator />
          </Container>
        </section>
      </Reveal>

      {/* 3. Interoperability — split panel */}
      <Reveal>
        <section className="border-t border-border-strong bg-surface/40 py-24">
          <Container>
            <SectionLabel>Interoperability</SectionLabel>
            <h2 className="mb-12 max-w-xl text-2xl font-normal text-fg sm:text-3xl">
              Plugs into what you already run.
            </h2>
            <div className="grid overflow-hidden rounded-xl border border-border-strong md:grid-cols-2">
              <div className="p-8">
                <h3 className="mb-5 text-sm font-medium text-fg">Monitors native changes</h3>
                <div className="flex flex-col gap-2">
                  {MONITORS.map((item) => (
                    <span key={item} className="font-mono text-xs text-fg-secondary">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="border-t border-border-strong p-8 md:border-t-0 md:border-l">
                <h3 className="mb-5 text-sm font-medium text-fg">Integrates with your stack</h3>
                <div className="flex flex-col gap-2">
                  {INTEGRATIONS.map((item) => (
                    <span key={item} className="font-mono text-xs text-fg-secondary">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Container>
        </section>
      </Reveal>

      {/* 4. Process — ticked timeline */}
      <Reveal>
        <section className="border-t border-border-strong py-24">
          <Container>
            <SectionLabel>How it works</SectionLabel>
            <h2 className="mb-16 max-w-xl text-2xl font-normal text-fg sm:text-3xl">
              From push to evidence, automatically.
            </h2>
            <div className="relative grid gap-10 pt-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              <div className="absolute inset-x-0 top-0 hidden h-px bg-border-strong lg:block" aria-hidden="true" />
              {PROCESS_STEPS.map((step) => (
                <div key={step.n} className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute -top-[42px] left-0 hidden h-2 w-2 rounded-full lg:block"
                    style={{ background: 'var(--color-purple)' }}
                  />
                  <p className="font-mono text-3xl text-fg-quaternary">{step.n}</p>
                  <h3 className="mt-3 text-sm font-medium text-fg">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{step.body}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>
      </Reveal>

      {/* 5. Use cases — numbered list */}
      <Reveal>
        <section className="border-t border-border-strong bg-surface/40 py-24">
          <Container style={{ maxWidth: 1000 }}>
            <SectionLabel>Built for</SectionLabel>
            <h2 className="mb-12 max-w-xl text-2xl font-normal text-fg sm:text-3xl">
              Every team touching the model layer.
            </h2>
            <div>
              {USE_CASES.map((uc, i) => (
                <div
                  key={uc.title}
                  className="flex gap-6 border-t border-border-strong py-7 last:border-b last:border-border-strong sm:gap-10"
                >
                  <span className="w-8 shrink-0 font-mono text-sm text-fg-quaternary sm:w-10">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-fg sm:text-base">{uc.title}</h3>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-secondary">{uc.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Container>
        </section>
      </Reveal>

      {/* 6. Triggers — vertical rail with divider */}
      <Reveal>
        <section className="border-t border-border-strong py-24">
          <Container style={{ maxWidth: 800 }}>
            <SectionLabel>Trigger contexts</SectionLabel>
            <h2 className="mb-14 max-w-xl text-2xl font-normal text-fg sm:text-3xl">
              Runs locally or fully headless.
            </h2>
            <div className="flex flex-col">
              {TRIGGERS.map((t, i) => (
                <div key={t.title}>
                  <div className="flex gap-5">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border"
                      style={{ borderColor: 'var(--color-border-purple)', background: 'var(--color-purple-soft)' }}
                    >
                      <t.icon className="h-5 w-5" style={{ color: 'var(--color-purple)' }} />
                    </span>
                    <div>
                      <h3 className="text-sm font-medium text-fg">{t.title}</h3>
                      <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-secondary">{t.body}</p>
                    </div>
                  </div>
                  {i < TRIGGERS.length - 1 && (
                    <div className="my-8 flex items-center gap-4 pl-[60px]" aria-hidden="true">
                      <span className="h-px flex-1 bg-border-strong" />
                      <span className="font-mono text-xs uppercase tracking-widest text-fg-quaternary">or</span>
                      <span className="h-px flex-1 bg-border-strong" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Container>
        </section>
      </Reveal>

      {/* 7. Security & Architecture FAQ */}
      <Reveal>
        <section className="border-t border-border-strong bg-surface/40 py-24">
          <Container style={{ maxWidth: 760 }}>
            <SectionLabel>Security &amp; architecture</SectionLabel>
            <h2 className="mb-4 flex items-center gap-3 text-2xl font-normal text-fg sm:text-3xl">
              <ShieldCheck className="h-6 w-6" style={{ color: 'var(--color-purple)' }} />
              Zero data retention, by design.
            </h2>
            <FaqSection />
          </Container>
        </section>
      </Reveal>

      {/* Final CTA — closing + nav anchor target */}
      <Reveal>
        <section id="early-access" className="border-t border-border-strong py-24">
          <Container style={{ maxWidth: 760 }} className="flex flex-col items-center text-center">
            <h2 className="text-2xl font-normal text-fg sm:text-3xl">Get early access.</h2>
            <p className="mt-4 max-w-xl text-sm text-fg-secondary sm:text-base">
              We&apos;re a small, early-stage open-source project shaping the spec with a handful
              of AI engineering teams. Join the beta and we&apos;ll set up vouqis.yml with you.
            </p>
            <div className="mt-8 flex justify-center">
              <EmailForm />
            </div>
          </Container>
        </section>
      </Reveal>
    </div>
  )
}
