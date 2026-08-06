import Image from 'next/image'

const FOOTER_LINKS = [
  { label: 'docs', href: '/docs' },
  { label: 'blog', href: '/blog' },
  { label: 'changelog', href: '/changelog' },
  { label: 'GitHub', href: 'https://github.com/Sasisundar2211/VouqisVerify' },
  { label: 'Design Partner', href: '/design-partner' },
]

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t" style={{ borderColor: 'var(--color-border-strong)' }}>
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <div className="flex items-center gap-4">
            <Image
              src="/vouqis-logo.jpg"
              alt="Vouqis"
              width={31}
              height={36}
              style={{ width: 'auto', height: '32px' }}
            />
            <span className="font-mono text-xs text-fg-tertiary">
              AI Change Verification for GitHub Pull Requests.
            </span>
          </div>

          <nav className="flex flex-wrap gap-8" aria-label="Footer navigation">
            {FOOTER_LINKS.map(({ label, href }) => {
              const external = href.startsWith('http')
              return (
                <a
                  key={label}
                  href={href}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noopener noreferrer' : undefined}
                  className="font-mono text-xs tracking-wider text-fg-tertiary uppercase hover:text-fg-secondary transition-colors"
                >
                  {label}
                </a>
              )
            })}
          </nav>
        </div>

        <div
          className="mt-12 border-t pt-6 font-mono text-xs text-fg-tertiary"
          style={{ borderColor: 'var(--color-border-strong)' }}
        >
          <p>© {year} Vouqis. MIT licensed.</p>
        </div>
      </div>
    </footer>
  )
}
