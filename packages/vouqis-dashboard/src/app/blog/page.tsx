import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog — Vouqis',
  description: 'Writing on AI change verification, eval-driven development, and safe AI deployment.',
}

const POSTS = [
  {
    slug: 'the-eval-was-never-run',
    date: '2026-07-01',
    tag: 'Engineering',
    title: 'The eval was never run',
    excerpt:
      'The PR looked fine. The prompt change was small. The model still passed manual review. Then it shipped, and a week later someone noticed the output quality had quietly degraded. This is the failure mode Vouqis exists to prevent, and why running evals on every PR is not optional once you ship AI.',
  },
  {
    slug: 'why-three-verdicts',
    date: '2026-06-18',
    tag: 'Product',
    title: 'Why BLOCK, WARN, SAFE, and not a score',
    excerpt:
      'A score of 0.74 tells you nothing about what to do. A verdict tells you exactly what to do. We spent three weeks debating whether to surface the raw eval number or collapse it to three outcomes. Here is why we chose three outcomes, and why the threshold is the most important config value in vouqis.yml.',
  },
  {
    slug: 'what-counts-as-an-ai-path',
    date: '2026-06-03',
    tag: 'Engineering',
    title: 'What counts as an AI path',
    excerpt:
      'The first question teams ask when they set up vouqis.yml is which directories should go in ai_paths. Prompt files are obvious. Model config is obvious. But what about the Python code that constructs the prompt? The retrieval logic? The system message template? This is our current thinking.',
  },
  {
    slug: 'early-access-what-we-learned',
    date: '2026-05-22',
    tag: 'Product',
    title: 'Early access: what we learned from the first five teams',
    excerpt:
      'We ran Vouqis Verify with five teams before writing a single line of marketing copy. Every one of them had merged AI changes without running evals that week. Two had production regressions they traced back to prompt changes. This is what we learned, and what we built differently because of it.',
  },
]

export default function BlogPage() {
  return (
    <div
      style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: 'clamp(56px,8vw,104px) clamp(20px,5vw,72px)',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 'clamp(56px,7vw,88px)' }}>
        <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-fg-secondary">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-purple)' }} />
          Blog
        </p>
        <h1 className="text-[clamp(38px,5vw,66px)] leading-[1.02] text-fg">
          Writing on AI verification
        </h1>
        <p className="mt-[18px] max-w-[52ch] text-[clamp(15px,1.1vw,17.5px)] leading-[1.65] text-fg-secondary">
          Engineering notes, incident walkthroughs, and product thinking from the Vouqis team.
        </p>
      </div>

      {/* Post list */}
      {POSTS.map((post, i) => (
        <article
          key={post.slug}
          className="border-border-strong"
          style={{
            paddingBottom: 'clamp(36px,5vw,56px)',
            marginBottom: 'clamp(36px,5vw,56px)',
            borderBottomWidth: i < POSTS.length - 1 ? 1 : 0,
            borderBottomStyle: 'solid',
          }}
        >
          <div className="mb-3.5 flex flex-wrap items-center gap-4">
            <span className="font-mono text-[10.5px] tracking-wider text-fg-quaternary">{post.date}</span>
            <span className="rounded-sm bg-surface-alt px-2 py-[3px] font-mono text-[10.5px] tracking-wider text-fg-tertiary">
              {post.tag}
            </span>
          </div>

          <h2 className="mb-3.5 max-w-[36ch] text-[clamp(24px,2.8vw,36px)] leading-[1.1] text-fg">
            {post.title}
          </h2>

          <p className="mb-5 max-w-[60ch] text-[clamp(14px,1vw,16.5px)] leading-[1.7] text-fg-secondary">
            {post.excerpt}
          </p>

          <span className="font-mono text-xs tracking-wide text-fg-quaternary">Coming soon</span>
        </article>
      ))}
    </div>
  )
}
