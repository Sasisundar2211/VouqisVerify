'use client'

import { useState } from 'react'
import { Check, ArrowRight } from 'lucide-react'

type FormStatus = 'idle' | 'loading' | 'ok' | 'error'

export default function EmailForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<FormStatus>('idle')

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    if (!email.includes('@')) {
      setStatus('error')
      return
    }
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
      <div className="flex items-center gap-2 font-mono text-sm text-fg-secondary">
        <Check className="h-4 w-4 text-purple" />
        You&apos;re on the list. We&apos;ll be in touch.
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-md flex-col gap-2"
    >
      <div
        className="flex w-full flex-col gap-1 rounded-md p-1 sm:flex-row sm:gap-0"
        style={{
          background: 'var(--color-surface-alt)',
          border: '1px solid var(--color-border)',
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your engineering email"
          className="flex-1 rounded-md bg-transparent px-3 py-2 font-mono text-sm text-fg placeholder-fg-quaternary focus:outline-none"
          aria-label="Engineering email"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="vq-pressable group flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-5 py-2 text-sm font-medium text-white"
          style={{
            background: 'var(--color-purple)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-purple-hover)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-purple)'
          }}
        >
          {status === 'loading' ? 'Submitting…' : 'Get early access'}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      </div>
      {status === 'error' && (
        <p className="font-mono text-xs" style={{ color: 'var(--color-block)' }}>
          Something went wrong. Try again.
        </p>
      )}
    </form>
  )
}
