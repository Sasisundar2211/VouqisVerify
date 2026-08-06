type SectionLabelProps = {
  children: React.ReactNode
}

export default function SectionLabel({ children }: SectionLabelProps) {
  return (
    <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-fg-secondary">
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: 'var(--color-purple)' }}
      />
      {children}
    </p>
  )
}
