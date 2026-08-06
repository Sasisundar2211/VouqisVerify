'use client'

import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

type Line = {
  text: string
  color: string
  weight: string
  style: string
}

const LINES: Line[] = [
  { text: '$ vouqis verify --config vouqis.yml', color: 'var(--color-fg)', weight: '500', style: 'normal' },
  { text: '→ baseline: origin/main', color: '#7FCB9F', weight: '400', style: 'normal' },
  { text: '→ changed: 7 files across 3 ai_paths', color: '#7FCB9F', weight: '400', style: 'normal' },
  { text: ' ', color: 'var(--color-fg-tertiary)', weight: '400', style: 'normal' },
  { text: '  prompts/          4 files   ████████', color: 'var(--color-fg-secondary)', weight: '400', style: 'normal' },
  { text: '  evals/            2 files   ████', color: 'var(--color-fg-secondary)', weight: '400', style: 'normal' },
  { text: '  config/           1 file    ██', color: 'var(--color-fg-secondary)', weight: '400', style: 'normal' },
  { text: ' ', color: 'var(--color-fg-tertiary)', weight: '400', style: 'normal' },
  { text: '→ running: python evals/run.py', color: 'var(--color-fg-tertiary)', weight: '400', style: 'normal' },
  { text: '  exit 0  ·  score: 0.71  ·  1240 ms', color: 'var(--color-warn)', weight: '500', style: 'normal' },
  { text: ' ', color: 'var(--color-fg-tertiary)', weight: '400', style: 'normal' },
  { text: '✕  BLOCK MERGE   (High confidence)', color: 'var(--color-block)', weight: '600', style: 'normal' },
  { text: '   eval score 0.71 < threshold 0.80', color: 'var(--color-block)', weight: '400', style: 'normal' },
  { text: ' ', color: 'var(--color-fg-tertiary)', weight: '400', style: 'normal' },
  { text: '→ posting report to PR #47...  done', color: '#7FCB9F', weight: '400', style: 'normal' },
  { text: '// without vouqis: this PR would have merged without eval evidence', color: 'var(--color-fg-quaternary)', weight: '400', style: 'italic' },
]

export function TerminalDemo() {
  const [visN, setVisN] = useState(0)
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prefersReducedMotion = usePrefersReducedMotion()
  const displayN = prefersReducedMotion ? LINES.length : visN

  function runDemo() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setVisN(0)
    setRunning(true)
    setStarted(true)

    let count = 0
    intervalRef.current = setInterval(() => {
      count += 1
      setVisN(count)
      if (count >= LINES.length) {
        if (intervalRef.current) clearInterval(intervalRef.current)
        setRunning(false)
      }
    }, 420)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el || prefersReducedMotion) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !started) {
          runDemo()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -10% 0px' }
    )

    observer.observe(el)

    const fallback = setTimeout(() => {
      if (!started) runDemo()
    }, 4500)

    return () => {
      observer.disconnect()
      clearTimeout(fallback)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersReducedMotion])

  return (
    <div>
      {/* Terminal box */}
      <div
        ref={containerRef}
        className="overflow-hidden rounded-lg border border-border-strong bg-surface"
        style={{ boxShadow: '0 40px 80px -34px rgba(0,0,0,0.6)' }}
      >
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-border-strong px-4 py-3">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="ml-2.5 font-mono text-[11.5px] tracking-wide text-fg-tertiary">
            vouqis &middot; verify
          </span>
        </div>

        {/* Content area */}
        <div
          className="font-mono"
          style={{
            padding: 'clamp(20px,3vw,34px) clamp(20px,3vw,38px)',
            fontSize: 'clamp(12.5px, 1.15vw, 14.5px)',
            lineHeight: 1.95,
            minHeight: 330,
          }}
        >
          {LINES.slice(0, displayN).map((line, i) => (
            <div
              key={i}
              style={{
                whiteSpace: 'pre-wrap',
                color: line.color,
                fontWeight: line.weight,
                fontStyle: line.style,
                animation: 'vq-line 0.34s cubic-bezier(0.16,1,0.3,1) both',
              }}
            >
              {line.text}
            </div>
          ))}
          {running && (
            <span
              aria-hidden="true"
              className="inline-block align-middle"
              style={{
                width: 9,
                height: 16,
                background: 'var(--color-purple)',
                animation: 'vq-blink 1s step-end infinite',
              }}
            />
          )}
        </div>
      </div>

      {/* Legend + replay */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 font-mono text-xs">
        <div className="flex flex-wrap gap-6">
          <span>
            <span style={{ color: 'var(--color-block)' }}>&#9679;</span>
            <span className="ml-2 text-fg-tertiary">without vouqis: PR merged without eval evidence</span>
          </span>
          <span>
            <span style={{ color: '#7FCB9F' }}>&#9679;</span>
            <span className="ml-2 text-fg-tertiary">with vouqis: verdict posted to PR before merge</span>
          </span>
        </div>
        <button
          onClick={runDemo}
          className="vq-pressable rounded border border-border-strong bg-transparent px-3.5 py-1.5 text-fg-tertiary hover:text-fg-secondary"
        >
          replay &#8635;
        </button>
      </div>
    </div>
  )
}
