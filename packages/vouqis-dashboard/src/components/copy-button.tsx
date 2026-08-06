'use client'

import { useState, useEffect, useRef, useSyncExternalStore } from 'react'

type OS = 'mac' | 'win'

const INSTALL: Record<OS, string> = {
  mac: 'brew install pipx && pipx install vouqis-verify',
  win: 'pip install pipx && pipx install vouqis-verify',
}

function subscribeNoop() {
  return () => {}
}
function getDetectedOs(): OS {
  return /Win/i.test(navigator.userAgent) ? 'win' : 'mac'
}
function getServerOs(): OS {
  return 'mac'
}

type CopyButtonProps = {
  size?: 'sm' | 'lg'
  /** When provided, copies this text instead of the default install command.
   *  Also renders as a minimal inline copy button. */
  text?: string
}

export function CopyButton({ size = 'sm', text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const detectedOs = useSyncExternalStore(subscribeNoop, getDetectedOs, getServerOs)
  const [manualOs, setManualOs] = useState<OS | null>(null)
  const os = manualOs ?? detectedOs
  const timer = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const cmd = text ?? INSTALL[os]

  function handleClick() {
    navigator.clipboard?.writeText(cmd).catch(() => {})
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1600)
  }

  // Minimal inline variant when a custom text is passed
  if (text !== undefined) {
    return (
      <button
        onClick={handleClick}
        className="vq-pressable whitespace-nowrap rounded font-mono text-[11px]"
        style={{
          padding: '3px 10px',
          background: copied ? 'rgba(127,203,159,0.15)' : 'var(--color-surface-alt)',
          border: `1px solid ${copied ? 'rgba(127,203,159,0.4)' : 'var(--color-border-strong)'}`,
          color: copied ? '#7FCB9F' : 'var(--color-fg-tertiary)',
        }}
      >
        {copied ? 'copied' : 'copy'}
      </button>
    )
  }

  const height = size === 'lg' ? 56 : 52
  const paddingLeft = size === 'lg' ? 20 : 18
  const fontSize = size === 'lg' ? 15 : 14
  const badgeSize = size === 'lg' ? 44 : 40

  return (
    <div>
      {/* macOS / Windows tab switcher */}
      <div className="mb-2.5 flex gap-1">
        {(['mac', 'win'] as OS[]).map((o) => (
          <button
            key={o}
            onClick={() => setManualOs(o)}
            aria-pressed={os === o}
            className="vq-pressable rounded border font-mono text-[11px] tracking-wide"
            style={{
              padding: '4px 12px',
              background: os === o ? 'var(--color-surface-elevated)' : 'transparent',
              color: os === o ? 'var(--color-fg)' : 'var(--color-fg-tertiary)',
              borderColor: 'var(--color-border-strong)',
            }}
          >
            {o === 'mac' ? 'macOS' : 'Windows'}
          </button>
        ))}
      </div>

      <button
        onClick={handleClick}
        className="vq-pressable inline-flex max-w-full items-center gap-2.5 overflow-x-auto whitespace-nowrap rounded font-mono"
        style={{
          height,
          padding: `0 6px 0 ${paddingLeft}px`,
          background: 'var(--color-surface-elevated)',
          color: 'var(--color-fg)',
          border: '1px solid var(--color-border-strong)',
          fontSize,
        }}
      >
        <span style={{ color: 'var(--color-purple)' }}>$</span>
        <span>{cmd}</span>
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-sm font-mono text-[11px] tracking-wide"
          style={{
            width: badgeSize,
            height: badgeSize,
            background: 'var(--color-purple-soft)',
            color: 'var(--color-fg-secondary)',
          }}
        >
          {copied ? 'copied' : 'copy'}
        </span>
      </button>
    </div>
  )
}
