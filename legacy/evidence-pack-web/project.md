# Vouqis Verify — MVP Product Context

## Read this first

This file defines **what** Vouqis Verify is allowed to build.

`CLAUDE.md` defines **how** to work: plan first, test, verify, make small changes, and document lessons.

If `CLAUDE.md` and this file conflict on product scope, stop and ask the user before making a product decision.

---

## 1. One-sentence product

Vouqis Verify finds AI-relevant changes hidden inside merged GitHub pull requests and compiles their review and verification evidence into an **AI Change Evidence Pack**.

---

## 2. The problem

AI SaaS teams can show that a GitHub pull request was approved and that CI checks ran. But when an auditor or customer security team asks, “Which changes altered AI behavior, and what evidence shows they were reviewed?”, teams often manually search PRs, screenshots, CI logs, and spreadsheets.

Vouqis identifies the AI-relevant PRs and organizes the evidence already present in GitHub.

---

## 3. Target pilot customer

Build for a company only when it meets all of these conditions:

- B2B AI SaaS company with a RAG, agent, or LLM feature in production
- Uses GitHub pull requests
- Uses Vanta, Drata, Secureframe, or an equivalent GRC/audit process
- Has an audit, customer security review, enterprise renewal, or questionnaire due within 30–90 days
- Will give read-only access to one selected repository, or provide an approved export of PR data

Primary user: compliance/security owner, COO, founder, or Head of Engineering who has to assemble evidence for an external review.

---

## 4. Core assumption being tested

A compliance owner at an AI SaaS company using GitHub and a GRC process will use—and pay for—an AI Change Evidence Pack that documents pull requests changing prompts, model settings, retrieval/access controls, or agent-tool permissions.

This MVP is successful only when at least one pilot customer:

1. Provides actual repository or PR data.
2. Uses the completed pack in a real external workflow: audit, security questionnaire, procurement review, or GRC evidence process.
3. Pays for, or signs a dated commitment for, recurring use.

“Looks useful,” “great idea,” or internal demo use is not validation.

---

## 5. MVP job

For **one repository** and **one selected 60–90-day period**, the system must:

1. Import merged GitHub PR metadata.
2. Identify likely AI behavior changes from PR titles and changed file paths.
3. Allow a founder/admin to manually review uncertain classifications.
4. Collect GitHub review and verification evidence.
5. Produce one downloadable **AI Change Evidence Pack**.

The MVP is concierge-assisted. Human review is a feature, not a failure.

---

## 6. Must build

### A. Data import

- Demo mode that works without GitHub credentials
- Real pilot mode using a read-only GitHub App
- Exactly one selected repository per workspace
- Period presets: last 60 days, last 90 days, custom date range
- Import only merged PRs
- Import/store:
  - PR number
  - PR title
  - GitHub PR URL
  - Author login
  - Merge date
  - Changed file paths and basic file metadata
  - Review/approval summary
  - GitHub check runs and commit-status summary

### B. AI-change classification

Use deterministic rules based on PR title and changed file paths only.

Possible categories:

- `PROMPT` — Prompt or instruction
- `MODEL_CONFIGURATION` — Model configuration
- `RETRIEVAL_ACCESS` — Retrieval or access rule
- `TOOL_PERMISSION` — Agent tool or permission
- `NONE` — Not an AI behavior change
- `NEEDS_HUMAN_REVIEW` — Weak, conflicting, or ambiguous signal

Every classification must have a readable reason, such as:

- `Matched changed path: config/retrieval_filters.yaml`
- `Matched prompt directory: prompts/support/`
- `PR title includes model provider`

### C. Human review queue

An internal pilot administrator must be able to:

- Confirm or exclude a flagged classification
- Add or remove categories
- Add a concise plain-English “What changed” summary
- Set evidence state
- Set verification state
- Save review decision and timestamp

### D. Evidence states

Use these exact states:

- `COMPLETE` — Required review and available verification evidence were found
- `MISSING` — Required evidence was not found
- `STALE` — Evidence exists but does not appear aligned with the changed PR/period
- `UNAVAILABLE` — Data could not be retrieved or is inaccessible

Use these verification states:

- `PASSED`
- `MISSING`
- `UNAVAILABLE`
- `NOT_APPLICABLE`

Never show unavailable evidence as passed or complete.

### E. AI Change Evidence Pack

Create a report with:

- Title: **AI Change Evidence Pack**
- Repository name
- Report period
- Generated date
- Number of PRs scanned
- Number of AI-related PRs identified
- Count by category and evidence state
- Evidence table with:
  - PR number/title/link
  - Merge date
  - AI change type
  - What changed
  - Approval evidence
  - Verification evidence
  - Evidence state
  - Source links
- Download/export formats:
  - CSV
  - Markdown
  - Print-friendly HTML, designed for browser “Save as PDF”

Every report must include this exact disclaimer:

> This pack documents identified AI-relevant code changes and associated GitHub review and verification evidence. It is not a statement that the AI system is safe, compliant, or approved by an auditor.

---

## 7. Classification patterns

### Prompt or instruction

Match paths/filenames containing:

- `prompt`, `prompts`
- `instruction`, `instructions`
- `template`, `templates`
- `system_prompt`, `prompt_template`
- `.prompt`, `.prompt.md`, `.prompt.yaml`, `.prompt.yml`

### Model configuration

Match paths/filenames containing:

- `model`, `models`
- `provider`, `providers`
- `llm`, `openai`, `anthropic`
- `temperature`, `max_tokens`, `max-tokens`, `token_budget`
- Configuration files: `.yaml`, `.yml`, `.json`, `.toml`, `.env.example`

Do **not** classify a generic dependency update as model configuration merely because it mentions an LLM library.

### Retrieval or access rule

Match paths/filenames containing:

- `retrieval`, `retriever`
- `vector`, `embedding`
- `rerank`, `reranker`
- `index`, `indexes`, `search`
- `filter`, `filters`, `top_k`, `top-k`, `routing`
- `access`, `acl`, `authorization`, `allowlist`, `tenant_filter`, `tenant-filter`

### Agent tool or permission

Match paths/filenames containing:

- `tool`, `tools`
- `capability`, `capabilities`
- `permission`, `permissions`
- `allowed_tools`, `allowed-tools`
- `tool_registry`, `tool-registry`
- `mcp`
- `schema`, `schemas` only when paired with tool, agent, mcp, capability, or permission context

### Confidence rules

- **High:** two or more strong signals or an explicit dedicated file
- **Medium:** one meaningful signal
- **Low / Needs human review:** weak, generic, or conflicting signal
- **None:** no relevant signal

---

## 8. Security and privacy constraints

### GitHub permissions

A real GitHub App may request only read permissions:

- Metadata: Read
- Pull requests: Read
- Contents: Read
- Checks: Read
- Commit statuses: Read

### Never do these things

- Never request GitHub write access
- Never post PR comments
- Never create GitHub Check Runs or commit statuses
- Never change branch protection
- Never block merges
- Never store raw source code
- Never store raw diff patches
- Never store complete prompt text
- Never store repository secrets or environment values
- Never expose GitHub access tokens to browser code
- Never log credentials, raw GitHub payloads, raw source, or raw prompts

Persist only the metadata necessary for evidence: PR record, changed file paths, classification, human summary, review/check summary, evidence state, timestamps, and source URLs.

If a future feature needs code/diff content, stop and ask before implementing it. That is a product and security decision, not a routine refactor.

---

## 9. Explicitly out of scope

Do not build any of the following without direct approval:

- AI governance platform features
- Compliance certifications or framework mapping
- “Audit-ready,” “SOC 2 compliant,” “AI safe,” or “will pass audit” claims
- Vanta, Drata, Secureframe, Slack, Jira, or email integrations
- Policy editor or repo rules configuration
- GitHub PR comments
- Required checks or merge blocking
- Prompt/output evaluation platform
- Runtime agent control or runtime permission enforcement
- Multi-repository support
- Multi-organization self-service onboarding
- SSO, SCIM, advanced RBAC
- Billing, subscriptions, or payment integration
- Analytics dashboard or trend reporting
- Public API
- Persistent LLM-based classification

If a request would add any item above, explain why it is outside the MVP and ask before changing scope.

---

## 10. Required stack

Use only unless a clear technical constraint requires discussion:

- Next.js latest stable, App Router
- TypeScript strict mode
- pnpm
- Tailwind CSS
- shadcn/ui
- Supabase Postgres
- Octokit for GitHub API access
- Zod for validation
- Vitest for unit tests
- Playwright for end-to-end testing
- Vercel-ready deployment
- Sentry only for sanitized error tracking

Use server components by default. Add `use client` only where browser interaction needs it.

Use a GitHub adapter interface:

- `MockGitHubAdapter` for demo mode/tests
- `OctokitGitHubAdapter` for real pilot mode

Do not add an LLM, queues, Docker, Redis, a vector database, or Vanta/Drata integrations in the MVP unless explicitly approved.

---

## 11. Demo repository requirements

Create a fictional demo repository:

`acme-ai/customer-support-agent`

Include at least 12 merged PRs:

- 3 prompt/instruction examples
- 2 model configuration examples
- 3 retrieval/access examples
- 2 tool/permission examples
- 2 ordinary non-AI examples
- At least 2 ambiguous classifications requiring manual review
- At least one each of Complete, Missing, Stale, and Unavailable states

Use fictional names and data only.

---

## 12. Required quality gates

Before declaring any milestone complete, run the relevant commands and fix failures:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright test
pnpm build
```

For classifier work:

1. Write the failing test first.
2. Confirm it fails for the intended reason.
3. Implement the smallest code needed to pass.
4. Do not change the test just to make it pass.
5. Temporarily break the rule once to confirm the test can catch a regression.

If a test appears wrong, stop and explain why before changing it.

---

## 13. Milestone order

Implement only one milestone at a time. Create/update `tasks/todo.md` before starting each one.

1. Project setup, types, and database schema
2. Mock GitHub adapter and seeded demo data
3. Rules-first classifier and unit tests
4. Import/results UI
5. Human review queue
6. Evidence-pack renderer and CSV/Markdown/print exports
7. Real GitHub App adapter behind environment flags
8. Playwright end-to-end test
9. README, environment example, and pilot-run instructions

After each milestone:

- Run relevant verification checks
- Give a concise summary of changed files
- Record incomplete items in `tasks/todo.md`
- Commit only after verification passes

---

## 14. First instruction for Claude Code

When beginning work, do this exactly:

> Read `CLAUDE.md` and `PROJECT.md`. Create `tasks/todo.md` and a detailed `PLAN.md` for Milestone 1 only. Do not write application code yet. List exact files, schema decisions, tests, verification commands, and any decisions requiring my answer. Wait for my approval before implementation.
