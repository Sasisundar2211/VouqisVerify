'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

const NAV_LINKS = [
  { label: 'docs', href: '/docs' },
  { label: 'blog', href: '/blog' },
  { label: 'changelog', href: '/changelog' },
  { label: 'GitHub', href: 'https://github.com/Sasisundar2211/VouqisVerify' },
]

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggleMobile = () => setMobileOpen(!mobileOpen)
  const closeMobile = () => setMobileOpen(false)

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        borderColor: 'var(--color-border-strong)',
        background:
          'color-mix(in srgb, var(--color-surface) 70%, transparent)',
      }}
    >
      <div
        className="mx-auto flex h-16 items-center justify-between gap-4"
        style={{ maxWidth: 1400, padding: '0 clamp(20px, 5vw, 72px)' }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center" aria-label="Vouqis home">
          <Image
            src="/vouqis-logo.jpg"
            alt="Vouqis"
            width={31}
            height={36}
            style={{ width: 'auto', height: '32px' }}
            priority
          />
        </Link>

        {/* Desktop nav */}
        <nav
          className="hidden md:flex items-center gap-10"
          aria-label="Primary navigation"
        >
          {NAV_LINKS.map(({ label, href }) => {
            const external = href.startsWith('http')
            const linkClassName =
              'font-mono text-xs tracking-wider text-fg-secondary uppercase hover:text-purple-text transition-colors duration-200'
            return external ? (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClassName}
              >
                {label}
              </a>
            ) : (
              <Link key={label} href={href} className={linkClassName}>
                {label}
              </Link>
            )
          })}
        </nav>

        {/* CTA + mobile toggle */}
        <div className="flex items-center gap-4">
          <Link
            href="/#early-access"
            className="vq-pressable hidden sm:block font-mono text-xs font-medium text-fg bg-purple hover:bg-purple-hover px-4 py-2 rounded"
          >
            Get early access
          </Link>
          <button
            onClick={toggleMobile}
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen}
            className="md:hidden p-2 text-fg-secondary hover:text-purple-text transition-colors"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className="md:hidden overflow-hidden transition-all duration-300"
        inert={!mobileOpen}
        style={{
          maxHeight: mobileOpen ? '320px' : '0px',
          borderTop: mobileOpen ? '1px solid var(--color-border-strong)' : 'none',
        }}
      >
        <nav
          className="flex flex-col gap-4 px-6 py-5"
          aria-label="Mobile navigation"
        >
          {NAV_LINKS.map(({ label, href }) => {
            const external = href.startsWith('http')
            const linkClassName = 'font-mono text-sm text-fg-secondary hover:text-purple-text transition-colors py-1'
            return external ? (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClassName}
                onClick={closeMobile}
              >
                {label}
              </a>
            ) : (
              <Link key={label} href={href} className={linkClassName} onClick={closeMobile}>
                {label}
              </Link>
            )
          })}
          <Link
            href="/#early-access"
            className="vq-pressable font-mono text-xs font-medium text-fg bg-purple hover:bg-purple-hover px-4 py-2 rounded text-center"
            onClick={closeMobile}
          >
            Get early access
          </Link>
        </nav>
      </div>
    </header>
  )
}
