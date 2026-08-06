'use client'

import { useState, type FormEvent } from 'react'

const BENEFITS = [
  { label: 'Founder support', desc: 'Direct access to the Vouqis team. We set up vouqis.yml with you.' },
  { label: 'Early access', desc: 'Shape the product before it ships. Your evals define the roadmap.' },
  { label: 'Direct feedback loop', desc: 'Weekly check-ins during onboarding. No support queue.' },
  { label: 'Product influence', desc: "If your eval setup isn't supported, we build it." },
]

type FormState = 'idle' | 'submitting' | 'success' | 'error'

export function DesignPartnerForm() {
  const [state, setState] = useState<FormState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState('submitting')
    setErrorMsg('')

    const form = e.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())

    try {
      const res = await fetch('/api/design-partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? 'Submission failed')
      }
      setState('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
      setState('error')
    }
  }

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: 'clamp(56px,8vw,104px) clamp(20px,5vw,72px)',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 'clamp(48px,6vw,80px)' }}>
        <p className="mb-5 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-fg-secondary">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-purple)' }} />
          Early access program
        </p>
        <h1 className="mb-6 max-w-[18ch] text-[clamp(40px,5.5vw,76px)] leading-[1.0] text-fg">
          We work with teams shipping AI changes every week.
        </h1>
        <p className="max-w-[54ch] text-[clamp(16px,1.2vw,19px)] leading-[1.6] text-fg-secondary">
          We&apos;re working with a small number of teams shipping AI changes to production. If
          your evals aren&apos;t running on every PR today, this is for you.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-x-[clamp(40px,6vw,88px)] gap-y-10">
        {/* Left: benefits */}
        <div style={{ flex: '1 1 260px', maxWidth: 360 }}>
          <div className="mb-5 font-mono text-[10.5px] uppercase tracking-widest text-fg-tertiary">
            What you get
          </div>
          {BENEFITS.map((b) => (
            <div key={b.label} className="border-border-strong py-[18px]" style={{ borderTopWidth: 1, borderTopStyle: 'solid' }}>
              <div className="mb-1.5 font-mono text-[13px] text-fg">{b.label}</div>
              <div className="text-[14.5px] leading-[1.55] text-fg-secondary">{b.desc}</div>
            </div>
          ))}
          <div className="border-border-strong" style={{ borderTopWidth: 1, borderTopStyle: 'solid' }} />

          <p className="mt-7 text-[clamp(18px,1.6vw,22px)] leading-[1.35] text-fg">
            No commitment. No contract. Just working software on your stack.
          </p>
        </div>

        {/* Right: form */}
        <div style={{ flex: '2 1 400px' }}>
          {state === 'success' ? (
            <div
              className="rounded-lg"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', padding: 'clamp(32px,4vw,52px)' }}
            >
              <div className="mb-4 font-mono text-[11px] tracking-wide" style={{ color: 'var(--color-safe)' }}>
                &#10003; APPLICATION RECEIVED
              </div>
              <p className="text-[clamp(22px,2.4vw,30px)] leading-[1.25] text-fg">
                We&apos;ll review your application and reach out within 48 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-wrap gap-4">
                <Field name="name" label="Name" required style={{ flex: '1 1 160px' }} />
                <Field name="email" label="Email" type="email" required style={{ flex: '1 1 200px' }} />
              </div>
              <div className="flex flex-wrap gap-4">
                <Field name="company" label="Company" style={{ flex: '1 1 160px' }} />
                <Field name="role" label="Your role" style={{ flex: '1 1 160px' }} />
              </div>
              <Field name="team_size" label="Engineering team size" placeholder="e.g. 3, 12, 50+" />
              <Field
                name="ai_systems"
                label="Which AI systems are you changing?"
                placeholder="e.g. prompts, evals, model config, agent logic"
                multiline
              />
              <Field
                name="failure_types"
                label="What eval failures or regressions have you seen? (optional)"
                placeholder="Score drops, no evals running, regressions caught late"
                multiline
              />
              <Field
                name="current_approach"
                label="How are you verifying AI changes today? (optional)"
                placeholder="Manual review, nothing yet, custom scripts"
                multiline
              />
              <Field name="why_now" label="Why is this a priority right now? (optional)" multiline />

              {state === 'error' && (
                <div
                  role="alert"
                  className="rounded font-mono text-xs"
                  style={{
                    color: 'var(--color-block)',
                    padding: '10px 14px',
                    background: 'var(--color-block-bg)',
                    border: '1px solid rgba(217,91,91,0.3)',
                  }}
                >
                  {errorMsg || 'Something went wrong. Try again or email hello@vouqis.tech.'}
                </div>
              )}

              <button
                type="submit"
                disabled={state === 'submitting'}
                className="vq-pressable inline-flex h-[52px] w-fit items-center justify-center rounded px-7 font-mono text-[13px] tracking-wide text-fg disabled:cursor-default"
                style={{ background: state === 'submitting' ? 'var(--color-surface-elevated)' : 'var(--color-purple)' }}
              >
                {state === 'submitting' ? 'Sending…' : 'Apply now →'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

type FieldProps = {
  name: string
  label: string
  type?: string
  placeholder?: string
  required?: boolean
  multiline?: boolean
  style?: React.CSSProperties
}

function Field({ name, label, type = 'text', placeholder, required, multiline, style }: FieldProps) {
  const inputClassName =
    'w-full rounded border font-mono text-[13px] text-fg outline-none focus-visible:border-purple' +
    (multiline ? ' resize-y' : '')
  const inputStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    borderColor: 'var(--color-border-strong)',
    padding: '11px 14px',
    minHeight: multiline ? 88 : undefined,
    boxSizing: 'border-box',
  }

  return (
    <div className="flex flex-col gap-1.5" style={style}>
      <label htmlFor={name} className="font-mono text-[11px] tracking-wide text-fg-tertiary">
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: 'var(--color-block)', marginLeft: 4 }}>
            *
          </span>
        )}
      </label>
      {multiline ? (
        <textarea id={name} name={name} placeholder={placeholder} required={required} className={inputClassName} style={inputStyle} />
      ) : (
        <input id={name} name={name} type={type} placeholder={placeholder} required={required} className={inputClassName} style={inputStyle} />
      )}
    </div>
  )
}
