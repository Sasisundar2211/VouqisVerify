import type { Metadata } from 'next'
import { Instrument_Serif, Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import Header from '@/components/layout/header'
import Footer from '@/components/layout/footer'
import './globals.css'

const instrumentSerif = Instrument_Serif({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-instrument-serif',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://vouqis.tech'),
  title: 'Vouqis — AI Change Verification',
  description:
    'Vouqis runs your evals on every pull request and posts a structured Review Package. It exposes changes to prompts, retrieval, agents, and tools before your team merges.',
  keywords: [
    'AI evaluation', 'pull request', 'LLM testing', 'eval CI',
    'AI change verification', 'prompt testing', 'GitHub Action',
    'AI agents', 'eval automation', 'merge verification',
  ],
  openGraph: {
    title: 'Vouqis — AI Change Verification',
    description: 'Review packages with evidence on every AI pull request. The merge call stays with your team.',
    type: 'website',
    url: 'https://vouqis.tech',
  },
  alternates: {
    canonical: 'https://vouqis.tech',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "history.scrollRestoration='manual';window.scrollTo(0,0)",
          }}
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>

        <Header />

        <main id="main-content">{children}</main>

        <Footer />

        <Analytics />
      </body>
    </html>
  )
}
