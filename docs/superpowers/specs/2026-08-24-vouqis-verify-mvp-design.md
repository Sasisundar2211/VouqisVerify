# Vouqis Verify — MVP Design Spec

Status: draft, awaiting approval
Date: 2026-08-24

## 1. Overview

Vouqis Verify is a **concierge-assisted GitHub evidence tool**. The operator (Vouqis) runs it manually per pilot customer engagement. For one connected GitHub repository, it imports merged pull requests over a chosen historical period, flags PRs that likely touched AI-relevant surfaces (prompts, model config, retrieval, agent/tool permissions) using path/filename/title rules, lets the operator manually review and confirm each flagged PR, and generates a downloadable **AI Change Evidence Pack** (CSV, Markdown, print-to-PDF HTML).

It does not prove the AI system is safe or compliant. It produces a record of what changed and what GitHub-native review/verification evidence exists for that change.

## 2. Non-goals (explicitly out of scope for V1)

- Customer accounts, signup, password reset, RBAC, SSO, billing, workspace/tenant switching.
- Public or customer-facing report links.
- GitHub App Manifest creation flow (dynamic app registration).
- Webhooks / event-driven imports.
- Background job queue.
- LLM-based classification.
- Reading PR body, raw diffs/patches, commit messages, or any code content.
- Persisting secrets, env values, or full GitHub API payloads.
- PR comments, merge blocking, policy editor, Vanta/Drata integration, framework mapping, dashboards.

## 3. Deployment & access

- **Host**: Render Web Service running the Next.js app.
- **Database**: Supabase Postgres.
- **No Vercel, no Neon, no Vercel Deployment Protection.**
- Because Render is publicly reachable and there are no customer accounts, the app is protected by a single-operator access gate, not a user system:
  - `OPERATOR_PASSWORD_HASH` — bcrypt/scrypt hash of one shared operator password, set as a Render env var.
  - `OPERATOR_SESSION_SECRET` — used to sign the session cookie (HMAC).
  - **Password verification and cookie verification are two separate code paths, on purpose:**
    - bcrypt/scrypt password comparison happens **only** inside the `/api/auth/login` route handler, never anywhere else.
    - Middleware runs on every request and must stay cheap: it only verifies the signed session cookie via HMAC/Web Crypto (`crypto.subtle` or Node `crypto`), never re-running bcrypt/scrypt per request.
  - Session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, signed, and carries only: `version`, `principal: "operator"`, `issued_at`, `expiry`. It never contains password material, GitHub installation IDs, repository IDs, or any customer data.
  - Explicit session expiry: 8 hours from issuance.
  - No `users` table — the cookie represents a single implicit "operator" principal, not a stored identity. (A user/membership table is explicitly not needed since there is exactly one shared credential, not multiple identities.)
  - Login route is rate-limited (fixed-window counter, in-memory is acceptable at this scale — single Render instance, low login volume).
  - Logout clears the cookie.
  - Middleware protects every route except `/login` and `/api/health`.
- **Local/demo mode**: the app must run with `npm run dev` and no GitHub or Supabase credentials configured. When `DATABASE_URL` is unset, the app uses an in-memory data store (see §6) instead of Supabase — demo mode never touches GitHub regardless (it reads a static fixture), so the only credential that needs a fallback is the database. The operator login gate stays active even in local dev; a small `scripts/hash-password.ts` script generates a hash for `.env.local`. (No dev-mode auth bypass — this is a security boundary, not a shortcut to skip.)

## 4. Environment variables

| Var | Purpose |
|---|---|
| `OPERATOR_PASSWORD_HASH` | Hash of the shared operator password |
| `OPERATOR_SESSION_SECRET` | HMAC signing key for the session cookie |
| `DATABASE_URL` | Supabase Postgres connection string. Unset → in-memory store (local/demo only) |
| `GITHUB_APP_ID` | Pre-created GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | App's private key (PEM) |
| `GITHUB_APP_SLUG` | Used to build the `github.com/apps/<slug>/installations/new` install link |
| `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET` | Captured now per the App's standard registration; unused by any V1 code path (no user OAuth in V1) |
| `GITHUB_APP_WEBHOOK_SECRET` | Captured now; unused (no webhooks in V1) |

The GitHub App itself is created **manually** by the operator in GitHub Developer Settings, with the smallest permission set that satisfies V1 (no manifest-flow UI is built):

- Metadata: Read
- Pull requests: Read
- Checks: Read
- Commit statuses: Read

**`Contents: Read` is intentionally excluded.** V1 never reads repository contents, blobs, files, or patches/source code — listing a PR's changed files and their status is covered by the Pull requests permission alone. Contents access is only added later if a real API limitation proves it necessary, not by default.

## 5. Data model

Six tables. All application data for a repository is reachable from `repository_id`.

```
organizations
  id, name, created_at

repositories
  id, organization_id, owner, name, installation_id, is_demo, active, created_at
  -- one active repository per organization, enforced at the DB level:
  -- PARTIAL UNIQUE INDEX on (organization_id) WHERE active = true

import_runs
  id, repository_id, period_start, period_end, status, pr_count, created_at
  status  enum(PENDING, RUNNING, SUCCEEDED, FAILED)
  -- a log of scan operations; does not own pull_requests
  -- on FAILED, only a sanitized error class/message is stored — never raw
  -- GitHub payloads, token data, source code, or request headers

pull_requests
  id, repository_id, github_pr_number, title, url, author_login, merged_at, base_ref,
  additions, deletions, changed_files jsonb, reviewers jsonb, checks jsonb, imported_at
  UNIQUE (repository_id, github_pr_number)
  -- changed_files/reviewers/checks are cached imported GitHub metadata, not immutable
  -- records: a re-import upserts these fields with the latest GitHub state.

ai_change_assessments
  id, pull_request_id (FK -> pull_requests),
  category            enum(PROMPT, MODEL_CONFIGURATION, RETRIEVAL_ACCESS, TOOL_PERMISSION, NONE, NEEDS_HUMAN_REVIEW),
  confidence           enum(HIGH, MEDIUM, LOW),
  detection_reasons    jsonb,   -- which rule/pattern fired, for transparency
  review_status        enum(PENDING, CONFIRMED, EXCLUDED),
  reviewer_summary      text nullable,
  evidence_state        enum(COMPLETE, MISSING, STALE, UNAVAILABLE),
  verification_state    enum(PASSED, MISSING, UNAVAILABLE, NOT_APPLICABLE),
  reviewed_at            timestamp nullable,
  created_at, updated_at
  UNIQUE (pull_request_id, category)
  -- prevents duplicate PROMPT/RETRIEVAL_ACCESS/etc rows if classification
  -- is ever retried for the same PR

evidence_packs
  id, repository_id, period_start, period_end, generated_at, pr_count, assessed_count,
  snapshot jsonb   -- frozen copy of the PR + assessment data used to render this pack
  CHECK (period_start <= period_end)
```

**Database-level integrity constraints** (not just application checks — these must exist as real Postgres constraints so a classifier bug or a retried import cannot silently create duplicate or inconsistent evidence rows):
- `repositories`: partial unique index on `organization_id` where `active = true`.
- `pull_requests`: unique `(repository_id, github_pr_number)`.
- `ai_change_assessments`: unique `(pull_request_id, category)`.
- `evidence_packs`: check constraint `period_start <= period_end`.
- `import_runs.status`: enum `PENDING, RUNNING, SUCCEEDED, FAILED`.

**Why `ai_change_assessments` is one-to-many with `pull_requests`**: a single PR can touch more than one AI surface (e.g. a prompt change and a retrieval filter change in the same diff). Each detected surface gets its own assessment row, reviewed independently.

**Why `evidence_packs` stores a snapshot**: an evidence pack is a point-in-time export. Assessments can keep changing after a pack is generated (the operator reviewing more PRs later, or correcting one); a previously generated pack must not silently change. `/reports/[id]` and `/reports/[id]/print` render purely from `evidence_packs.snapshot` — no live joins at render time. Generating a new pack takes a fresh snapshot of current data.

**Re-import / upsert behavior**: on every import run, for each fetched PR, `pull_requests` is upserted by `(repository_id, github_pr_number)`. `ai_change_assessments` rows are created **only the first time a PR is seen** (new insert into `pull_requests`) — classification runs once, at first import. If the PR already existed, its assessments are left untouched, so operator review always survives a rescan.

## 6. Storage abstraction

A small repository/port interface (`DataStore`) with two implementations:
- `PostgresStore` — Supabase Postgres via Drizzle ORM, used whenever `DATABASE_URL` is set.
- `InMemoryStore` — a process-local JS object graph, used when `DATABASE_URL` is unset (local dev / demo without a database) and directly by unit tests (fast, no DB needed for classifier/evidence-state tests).

Both implement the same methods (`upsertPullRequests`, `createAssessments`, `updateAssessment`, `createEvidencePack`, etc.), so route/action code never branches on which store is active.

Drizzle ORM is used (not Prisma) for schema/migrations/queries against Supabase Postgres — no codegen step, simple SQL-shaped queries.

## 7. GitHub integration

- **Auth**: `octokit`'s App + installation-token support. The App is pre-created manually (see §4); the app code never creates or modifies App registrations.
- **Installation flow** (per engagement, no manifest, no webhooks): operator opens `https://github.com/apps/<GITHUB_APP_SLUG>/installations/new`, picks the target repository, GitHub redirects back to `/api/github/install-callback?installation_id=...&setup_action=...`.

  **Installation callback security — the query string is never trusted by itself:**
  - The route requires an existing valid operator session (protected by the same middleware as everything else).
  - `installation_id` from the query string is treated as an unverified hint, not a fact. The callback uses the GitHub App's own server-side JWT auth to call `GET /app/installations/{installation_id}` and confirm that installation actually exists and belongs to this App.
  - The callback then lists the repositories actually accessible to that verified installation (`GET /installation/repositories` using an installation token minted from the verified installation) — never reads `owner`/`repo` from the URL.
  - The operator is shown that verified repository list and must explicitly pick exactly one. If the installation has zero accessible repositories, the callback shows an error and saves nothing.
  - Only the verified `installation_id` plus the operator-selected repository's verified `id`, `owner`, and `name` (as returned by GitHub, not the query string) are written to the `repositories` row.
- **Import** (manually triggered by the operator, synchronous with a loading state — no queue in V1 unless real-world import duration proves this wrong): for the chosen period, fetch merged PRs (paginated `GET /repos/{owner}/{repo}/pulls?state=closed`, filtered by `merged_at`), then per PR: changed files, reviews, and check-runs/status for the merge commit.

### Data retention allowlist (privacy boundary)

Only the following are fetched into memory and persisted. This is a strict allowlist, not a redaction step applied after the fact:

| Stored | Not stored |
|---|---|
| PR number, title, url, author login, merged_at, base_ref, additions/deletions counts | PR body/description |
| Changed file **paths**, change status (added/modified/removed), per-file additions/deletions counts | File **patch/diff content** (GitHub's file-list response includes a `patch` field — explicitly dropped before storing) |
| Reviewer login, review state (approved/changes_requested/commented), submitted_at | Review comment bodies |
| Check/status name, status, conclusion, url | Check run logs/output |
| — | Commit messages (commits are not fetched beyond the merge SHA needed to look up checks) |
| — | Secrets, env values, full raw API response payloads |

## 8. Classification engine

Pure function, no network/DB access: `classify(changedFiles: {path, extension}[], title: string) → Assessment[]`.

Inputs are strictly limited to **PR title, changed file paths, filename/path patterns, and file extensions** — never PR body, diffs, commit messages, or an LLM.

Three-tier outcome per candidate signal:

1. **Confident category match** (HIGH confidence: path pattern hit; MEDIUM: title/filename keyword hit without a strong path match) → one assessment row per matched category (`PROMPT`, `MODEL_CONFIGURATION`, `RETRIEVAL_ACCESS`, `TOOL_PERMISSION`), each with `detection_reasons` recording which pattern/keyword fired.
2. **Confidently not AI-relevant** → a single `NONE` assessment. This includes a deliberate false-positive guard: if the *only* changed files are dependency manifests/lockfiles (`package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `requirements.txt`, `Pipfile.lock`, `go.sum`, `Gemfile.lock`) — even if a keyword like "openai" appears in a bumped dependency name — the PR classifies `NONE`, not `MODEL_CONFIGURATION`. Routine dependency bumps are a known false-positive source and are excluded by construction.
3. **Ambiguous** (a generic/low-signal file — e.g. a bare `schema.ts`/`config.json`/`config.yaml` outside any category-specific path, with no corroborating title keyword) → a single `NEEDS_HUMAN_REVIEW` assessment, LOW confidence. This is a distinct outcome from `NONE`: it means the rule engine could not confidently decide either way, and a human must look.

Rule sets (illustrative, refined during implementation against the required test fixtures in §11):

- **PROMPT**: paths matching `prompts?/`, `system_prompt`, `instructions?`; title keywords "prompt", "system message".
- **MODEL_CONFIGURATION**: paths like `model.config.*`, `llm.config.*`; title keywords "model", "provider", "temperature", "max_tokens", "switch to gpt/claude/gemini". A bare `provider.ts`/`provider.*` filename, on its own, is too generic to trust as HIGH — it commonly means unrelated dependency-injection wiring. It stays **MEDIUM** confidence unless corroborated by at least one of: the path sitting inside a dedicated AI/LLM/model-config directory, a matching title keyword, or another changed file in the same PR carrying its own model-specific signal. Only with corroboration does it get promoted to HIGH — exactly the kind of case the human review queue exists for.
- **RETRIEVAL_ACCESS**: paths under `retrieval/`, `rag/`, `vectorstore/`, `embeddings/`, `index/`; title keywords "retrieval", "RAG", "vector", "embedding", "chunk", "access control".
- **TOOL_PERMISSION**: paths under `agents?/`, `tools?/`, `mcp\.json`, `permissions\.ya?ml`, `scopes\.json`; title keywords "agent", "tool", "MCP", "permission", "scope".

Every match is visible in the UI (which pattern/keyword fired) — never a black box.

## 9. Review workflow & evidence-state rules

On import, each new PR's assessments are created with:
- `review_status = PENDING`
- `evidence_state = MISSING` (a conservative default — **never** `COMPLETE`)
- `verification_state` left as `MISSING` unless the operator sets otherwise

**Evidence state is never auto-finalized.** The presence of an approval and green CI checks is surfaced as a **non-authoritative, plainly-labeled observation** in the review UI (e.g. "GitHub shows 1 approval and passing CI checks") — it never sets `evidence_state` or `verification_state` itself. Only an explicit operator action (selecting a value in the review form) changes those fields, and `reviewed_at`/`review_status` update only on that explicit action.

Review UI per PR/assessment: confirm or override `category`, set `review_status` (`CONFIRMED`/`EXCLUDED`), write a free-text `reviewer_summary` ("what changed"), and set `evidence_state` + `verification_state`.

## 10. Evidence pack generation & report language

Generating a pack (`/engagements/[id]/packs/new`) takes the repository's current PRs + assessments for the engagement's period, writes an `evidence_packs.snapshot`, and renders three formats from that snapshot: CSV, Markdown, print-friendly HTML (`/reports/[id]/print`, `@media print` styling, no PDF library — operator uses the browser's Print → Save as PDF).

**Report inclusion rule** — the pack is a focused record of AI-relevant change, not a dump of every merged PR:

- Include only assessments with `review_status = CONFIRMED`.
- `NONE` assessments are excluded by default.
- Assessments with `review_status = EXCLUDED` are excluded.
- `NEEDS_HUMAN_REVIEW` is included only once the operator has confirmed it as a real category (i.e. it's no longer sitting at `NEEDS_HUMAN_REVIEW`/`PENDING` — the operator recategorized and confirmed it).
- Separately from the included rows, the pack shows scan totals: total merged PRs scanned, PRs classified non-AI (`NONE`), PRs still pending human review, and confirmed AI-relevant PRs included in the pack.

**Required, verbatim report language:**

- Standard per-change description: *"Evidence of GitHub review and verification associated with this identified AI-relevant change."*
- Mandatory disclaimer, included in every pack (all three formats): *"This pack documents identified AI-relevant code changes and associated GitHub review and verification evidence. It is not a statement that the AI system is safe, compliant, or approved by an auditor."*

**Facts vs. conclusions — the report must visually/textually separate the two**, not just avoid banned words:

- *Allowed*, because it's a factual GitHub record, clearly labeled as such: "GitHub review state: Approved by `jane-engineer` on 2026-08-14", "GitHub check conclusion: Success".
- *Allowed*, because it's a factual record of what the operator entered, clearly labeled as such: "Operator-recorded evidence state: Complete", "Operator-recorded verification state: Passed".
- *Prohibited* anywhere in generated output, because these are compliance/safety conclusions the tool has no authority to make: "audit-ready", "compliant", "SOC 2 compliant", "AI safe", "approved by an auditor", "will pass audit", "certified", "guaranteed".

The word "approved" itself is not banned — GitHub's own review-state vocabulary uses it, and hiding that fact would make the pack less useful. What's banned is *this tool* asserting a compliance/audit conclusion. Every rendered fact is prefixed with its source ("GitHub review state:" / "Operator-recorded ...:") so a reader can never mistake a GitHub fact or an operator's manual judgment for Vouqis Verify's own claim.

## 11. Testing

**Vitest** (unit) for the classifier and evidence-state logic, run against the pure `classify()` function and the `InMemoryStore`:

1. Prompt path → `PROMPT`, HIGH confidence
2. Model configuration path → `MODEL_CONFIGURATION`
3. Retrieval/access path → `RETRIEVAL_ACCESS`
4. Tool/permission path → `TOOL_PERMISSION`
5. Ordinary non-AI PR → `NONE`
6. Generic LLM dependency version bump (lockfile-only change) → `NONE`, not a false-positive category match
7. Multiple categories touched in one PR → multiple assessment rows
8. Ambiguous generic file (e.g. bare `schema.ts`) → `NEEDS_HUMAN_REVIEW`
9. Re-import of a repository with existing reviewed assessments → assessments unchanged (upsert only touches `pull_requests` metadata)
10. Newly imported PR → `evidence_state` is `MISSING`, never `COMPLETE`, regardless of approval/check state in the fixture
11. Report/pack builder given a mix of `CONFIRMED`, `PENDING`, `EXCLUDED`, and `NONE` assessments → only `CONFIRMED` rows appear in the pack; the others are reflected solely in the separate scan-totals summary
12. Inserting a second assessment for the same `(pull_request_id, category)` → rejected by the `ai_change_assessments` unique constraint (exercised against `PostgresStore`/a test DB, not `InMemoryStore`)

**Playwright** (one E2E test): demo workspace → import mock PRs (fixture includes at least one PR that stays `NONE` and one left `PENDING`) → open and review one ambiguous (`NEEDS_HUMAN_REVIEW`) PR, confirming it → generate an evidence pack → assert the report contains the confirmed PR's row with source-labeled facts ("GitHub review state: ...", "Operator-recorded evidence state: ..."), the mandatory disclaimer text, the scan-totals summary, and that the untouched `NONE`/`PENDING` PRs do **not** appear as pack rows.

## 12. Routes

```
/login
/                          engagement list (operator home)
/engagements/new           setup: demo data or GitHub install, pick period (60/90/custom)
/engagements/[id]/import   trigger/re-trigger a synchronous import run
/engagements/[id]/review   PR list + per-assessment review drawer
/engagements/[id]/packs/new  generate an evidence pack (snapshot)
/reports/[id]              rendered pack (CSV/Markdown/HTML views)
/reports/[id]/print        print-styled HTML for Print → Save as PDF
/api/health                unauthenticated liveness check
/api/github/install-callback   GitHub installation redirect target (internal)
/api/auth/login, /api/auth/logout   session gate actions (internal)
```

No customer-facing routes, no public report links, no signup/workspace-switcher UI.

## 13. Architecture summary

```
Browser
  -> Render-hosted Next.js app
  -> single-operator password/session gate (middleware)
  -> server actions / route handlers
       -> Octokit (GitHub App installation auth, read-only)
       -> Supabase Postgres (via Drizzle) | InMemoryStore (no DATABASE_URL)
  -> CSV / Markdown / print-HTML export (rendered from evidence_packs.snapshot)
```

No Vercel. No Neon. No webhooks. No background queue. No LLM classifier. No customer authentication. No public reports.

## 14. Milestones

- **M0 — Scaffolding & access gate**: `/api/auth/login` (bcrypt/scrypt happens only here) + `/api/auth/logout`, middleware that verifies only the signed HMAC session cookie (no password hashing on the request path), 8-hour expiry, `/api/health`, `DataStore` interface + `InMemoryStore`, Supabase/Drizzle wiring behind `DATABASE_URL`.
- **M1 — Data model**: Drizzle schema for all six tables with the DB-level constraints from §5 (partial unique index, unique `(repository_id, github_pr_number)`, unique `(pull_request_id, category)`, `period_start <= period_end` check, `import_runs.status` enum), migrations against Supabase, seed/reset scripts for local dev.
- **M2 — Demo mode**: static mock-PR fixture (mix of clear-category, `NONE`, and ambiguous PRs), engagement creation in demo mode, import run against the fixture.
- **M3 — Classification engine**: pure `classify()` function + all 12 Vitest cases from §11 passing, including the `provider.ts`-alone-is-MEDIUM rule.
- **M4 — GitHub integration**: least-privilege App permissions (Metadata/Pull requests/Checks/Commit statuses read, no Contents), Octokit installation auth, the hardened install-callback (verify installation server-side, list verified repos, require explicit single-repo selection — never trust query-string `installation_id`/owner/repo), real import against a live installed repo, retention allowlist enforced (patch/body/comment-body stripped before storage).
- **M5 — Review UI**: PR list + filters (flagged/all), per-assessment review drawer, non-authoritative approval/CI observation text, explicit evidence/verification state controls.
- **M6 — Evidence pack & reports**: pack generation (snapshot), report inclusion rule (CONFIRMED-only, scan totals shown separately), CSV/Markdown/print-HTML renderers with source-labeled facts vs. operator assessments, mandatory disclaimer + required phrasing wired in, Playwright E2E test passing.

## 15. Open assumptions to confirm

These are choices made to resolve ambiguity in the brief; flag any you want changed before implementation starts:

- `evidence_state` defaults to `MISSING` (not a nullable/unset 5th state) on creation — simplest schema that still satisfies "never auto-Complete."
- Rate limiting on `/login` is an in-memory fixed-window counter (fine for one Render instance / one operator); not backed by Redis.
- The "ambiguous file" heuristic in §8 (tier 3) will need concrete pattern definitions during M3 implementation, tuned against the required test fixtures — the spec fixes the *behavior contract* (three tiers, test cases 6–8 must pass) rather than an exhaustive pattern list.
- `NEEDS_HUMAN_REVIEW → confirmed` is read as: the operator recategorizes it to one of the four real categories and sets `review_status = CONFIRMED`; there's no separate "confirm as NEEDS_HUMAN_REVIEW-and-include-anyway" path in V1. If you want ambiguous-but-still-unresolved PRs to be includable as-is, say so and §10's inclusion rule changes.

## 16. Amendment history

- 2026-08-25: applied six required changes plus one classification fix from review: hardened GitHub install-callback (server-side verification, no trust in query-string `installation_id`/owner/repo), least-privilege GitHub App permissions (dropped `Contents: Read`), report language rework (facts vs. conclusions, `NONE`/`EXCLUDED`/unconfirmed rows excluded from packs), DB-level integrity constraints (partial unique active-repo index, PR uniqueness, assessment category uniqueness, pack period check, import-run status enum), separated password verification (login route only) from cookie verification (middleware only, HMAC, 8h expiry, minimal cookie payload), and demoted bare `provider.ts` to MEDIUM confidence.
