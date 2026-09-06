# Vouqis Verify MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the single-operator Vouqis Verify MVP — import merged GitHub PRs for one repository, classify AI-relevant changes with rules + human review, and export an AI Change Evidence Pack.

**Architecture:** Next.js 16 App Router on Render, Supabase Postgres via Drizzle ORM (falling back to an in-memory `DataStore` when `DATABASE_URL` is unset), a single-operator HMAC session cookie gate enforced by `proxy.ts` + a per-request `requireSession()` check in every Server Action/Route Handler, and a GitHub App (Octokit) for read-only PR data.

**Tech Stack:** Next.js 16 (App Router, Node.js runtime), React 19, TypeScript, Tailwind v4 (already scaffolded), Drizzle ORM + `postgres` driver, `octokit` (App + REST), Node built-in `crypto` for password hashing (scrypt) and session signing (HMAC) — no bcrypt/jose dependency needed, Vitest for unit tests, Playwright for one E2E test. No shadcn/ui — review UI uses plain Tailwind + the native `<details>`/`<summary>` disclosure element (zero client JS needed for the per-PR review panel).

**Spec:** `docs/superpowers/specs/2026-08-24-vouqis-verify-mvp-design.md`

## Global Constraints

- No Vercel, no Neon, no Vercel Deployment Protection — deploy target is Render; database is Supabase Postgres.
- No GitHub App Manifest flow, no webhooks, no background queue, no LLM classification.
- GitHub App permissions: `Metadata: Read`, `Pull requests: Read`, `Checks: Read`, `Commit statuses: Read` only — never `Contents: Read`.
- Classifier inputs are strictly PR title + changed file paths/extensions — never PR body, diffs, commit messages.
- Retention allowlist (never persist): PR body, file patch/diff content, review comment bodies, check run logs, commit messages, secrets, full raw API payloads.
- `ai_change_assessments` is one-or-more rows per PR (categories: `PROMPT`, `MODEL_CONFIGURATION`, `RETRIEVAL_ACCESS`, `TOOL_PERMISSION`, `NONE`, `NEEDS_HUMAN_REVIEW`).
- On creation, every assessment starts `review_status = PENDING`, `evidence_state = MISSING`, `verification_state = MISSING` — `evidence_state` is **never** auto-set to `COMPLETE`.
- Re-import upserts `pull_requests` metadata only; `ai_change_assessments` rows are created once, on first sight of a PR, and never touched again by an import.
- Evidence pack report inclusion: only `review_status = CONFIRMED` assessments appear as rows; `NONE` and `EXCLUDED` are excluded; scan totals are shown separately.
- Mandatory disclaimer (verbatim) in every pack: *"This pack documents identified AI-relevant code changes and associated GitHub review and verification evidence. It is not a statement that the AI system is safe, compliant, or approved by an auditor."*
- Report facts are always source-labeled: `"GitHub review state: ..."` / `"GitHub check conclusion: ..."` for GitHub facts, `"Operator-recorded evidence state: ..."` / `"Operator-recorded verification state: ..."` for operator judgments. Prohibited tool-asserted phrases: "audit-ready", "compliant", "SOC 2 compliant", "AI safe", "approved by an auditor", "will pass audit", "certified", "guaranteed".
- DB constraints (Postgres-level, not just app checks): partial unique index on `repositories.organization_id` where `active = true`; unique `(repository_id, github_pr_number)` on `pull_requests`; unique `(pull_request_id, category)` on `ai_change_assessments`; check `period_start <= period_end` on `evidence_packs`; `import_runs.status` enum `PENDING/RUNNING/SUCCEEDED/FAILED`.
- Session cookie: HMAC-signed, `HttpOnly`, `Secure`, `SameSite=Lax`, 8-hour expiry, payload limited to `{v, principal: "operator", iat, exp}` — never installation IDs, repo IDs, or customer data. Password verification (scrypt) happens only in the login route; `proxy.ts` and every other check verify the signed cookie only, never re-hash.
- Next.js 16 renamed `middleware.ts` to `proxy.ts` (exported `proxy` function, defaults to Node.js runtime) — this plan uses that convention, not `middleware.ts`. `cookies()`/`headers()` from `next/headers` are async in this version.
- Per Next.js's own auth guidance, `proxy.ts` does an **optimistic** redirect only; every Server Action and Route Handler must independently call the shared `requireSession()` check — never rely on proxy alone.

---

## Milestone M0 — Foundations & Access Gate

### Task 1: Dependencies and environment scaffolding

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: the dependency set every later task assumes is installed.

- [ ] **Step 1: Add runtime and dev dependencies**

```bash
pnpm add drizzle-orm postgres octokit
pnpm add -D drizzle-kit vitest @playwright/test dotenv-cli
```

- [ ] **Step 2: Create `.env.example`**

```bash filename=".env.example"
# Access gate
OPERATOR_PASSWORD_HASH=
OPERATOR_SESSION_SECRET=

# Database (Supabase Postgres). Unset -> falls back to the in-memory store.
DATABASE_URL=

# GitHub App (created manually in GitHub Developer Settings; permissions:
# Metadata read, Pull requests read, Checks read, Commit statuses read)
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_SLUG=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_WEBHOOK_SECRET=
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts filename="vitest.config.ts"
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Add test script to `package.json`**

Add under `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 5: Verify Vitest runs with zero tests**

Run: `pnpm test`
Expected: "No test files found" or similar — confirms Vitest is wired up before any test exists.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example vitest.config.ts
git commit -m "chore: add drizzle/octokit/vitest/playwright dependencies and env scaffolding"
```

---

### Task 2: Password hashing module

**Files:**
- Create: `src/lib/auth/password.ts`
- Test: `src/lib/auth/password.test.ts`
- Create: `scripts/hash-password.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): string`, `verifyPassword(password: string, storedHash: string): boolean` — used only by Task 5's login route.

- [ ] **Step 1: Write the failing tests**

```ts filename="src/lib/auth/password.test.ts"
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a correct password against its own hash", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", () => {
    const a = hashPassword("same password");
    const b = hashPassword("same password");
    expect(a).not.toBe(b);
    expect(verifyPassword("same password", a)).toBe(true);
    expect(verifyPassword("same password", b)).toBe(true);
  });

  it("rejects a malformed stored hash instead of throwing", () => {
    expect(verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/auth/password.test.ts`
Expected: FAIL — `./password` has no exported members yet.

- [ ] **Step 3: Implement**

```ts filename="src/lib/auth/password.ts"
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [saltHex, keyHex] = storedHash.split(":");
  if (!saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const storedKey = Buffer.from(keyHex, "hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH);

  if (derivedKey.length !== storedKey.length) return false;
  return timingSafeEqual(derivedKey, storedKey);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/auth/password.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Write the operator hash-generation script**

```ts filename="scripts/hash-password.ts"
import { hashPassword } from "../src/lib/auth/password";

const password = process.argv[2];
if (!password) {
  console.error("Usage: pnpm dotenv -e .env.local -- tsx scripts/hash-password.ts <password>");
  process.exit(1);
}

console.log(hashPassword(password));
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/password.ts src/lib/auth/password.test.ts scripts/hash-password.ts
git commit -m "feat: add scrypt-based operator password hashing"
```

---

### Task 3: Session cookie sign/verify module

**Files:**
- Create: `src/lib/auth/session.ts`
- Test: `src/lib/auth/session.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SESSION_COOKIE_NAME: string`, `SESSION_DURATION_SECONDS: number`, `createSessionCookieValue(secret: string, now?: number): string`, `verifySessionCookieValue(cookieValue: string | undefined, secret: string, now?: number): boolean` — consumed by Task 5 (login sets it, `requireSession` verifies it) and by `proxy.ts`.

- [ ] **Step 1: Write the failing tests**

```ts filename="src/lib/auth/session.test.ts"
import { describe, it, expect } from "vitest";
import {
  createSessionCookieValue,
  verifySessionCookieValue,
  SESSION_DURATION_SECONDS,
} from "./session";

const SECRET = "test-secret-do-not-use-in-prod";

describe("session cookie", () => {
  it("verifies a freshly created cookie", () => {
    const value = createSessionCookieValue(SECRET);
    expect(verifySessionCookieValue(value, SECRET)).toBe(true);
  });

  it("rejects a cookie signed with a different secret", () => {
    const value = createSessionCookieValue(SECRET);
    expect(verifySessionCookieValue(value, "a-different-secret")).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const value = createSessionCookieValue(SECRET);
    const [encoded, signature] = value.split(".");
    const tampered = `${encoded}extra.${signature}`;
    expect(verifySessionCookieValue(tampered, SECRET)).toBe(false);
  });

  it("rejects an expired cookie", () => {
    const issuedAt = 1_000_000;
    const value = createSessionCookieValue(SECRET, issuedAt);
    const afterExpiry = issuedAt + SESSION_DURATION_SECONDS + 1;
    expect(verifySessionCookieValue(value, SECRET, afterExpiry)).toBe(false);
  });

  it("accepts a cookie right up to its expiry boundary", () => {
    const issuedAt = 1_000_000;
    const value = createSessionCookieValue(SECRET, issuedAt);
    const justBeforeExpiry = issuedAt + SESSION_DURATION_SECONDS;
    expect(verifySessionCookieValue(value, SECRET, justBeforeExpiry)).toBe(true);
  });

  it("rejects an undefined cookie", () => {
    expect(verifySessionCookieValue(undefined, SECRET)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/auth/session.test.ts`
Expected: FAIL — module has no exports yet.

- [ ] **Step 3: Implement**

```ts filename="src/lib/auth/session.ts"
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "vouqis_session";
export const SESSION_DURATION_SECONDS = 8 * 60 * 60; // 8 hours

interface SessionPayload {
  v: 1;
  principal: "operator";
  iat: number;
  exp: number;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSessionCookieValue(
  secret: string,
  issuedAt: number = nowSeconds()
): string {
  const payload: SessionPayload = {
    v: 1,
    principal: "operator",
    iat: issuedAt,
    exp: issuedAt + SESSION_DURATION_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifySessionCookieValue(
  cookieValue: string | undefined,
  secret: string,
  now: number = nowSeconds()
): boolean {
  if (!cookieValue) return false;

  const [encoded, signature] = cookieValue.split(".");
  if (!encoded || !signature) return false;

  const expectedSignature = sign(encoded, secret);
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (signatureBuf.length !== expectedBuf.length) return false;
  if (!timingSafeEqual(signatureBuf, expectedBuf)) return false;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return false;
  }

  if (payload.v !== 1 || payload.principal !== "operator") return false;
  if (payload.exp < now) return false;

  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/auth/session.test.ts`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts
git commit -m "feat: add HMAC-signed operator session cookie helpers"
```

---

### Task 4: Login rate limiter

**Files:**
- Create: `src/lib/auth/rate-limit.ts`
- Test: `src/lib/auth/rate-limit.test.ts`

**Interfaces:**
- Produces: `class FixedWindowRateLimiter { constructor(opts: { max: number; windowMs: number }); check(key: string, now?: number): boolean }` (returns `true` if the call is allowed, `false` if rate-limited) — consumed by Task 5's login route.

- [ ] **Step 1: Write the failing tests**

```ts filename="src/lib/auth/rate-limit.test.ts"
import { describe, it, expect } from "vitest";
import { FixedWindowRateLimiter } from "./rate-limit";

describe("FixedWindowRateLimiter", () => {
  it("allows calls up to the max within a window", () => {
    const limiter = new FixedWindowRateLimiter({ max: 3, windowMs: 60_000 });
    expect(limiter.check("ip1", 0)).toBe(true);
    expect(limiter.check("ip1", 0)).toBe(true);
    expect(limiter.check("ip1", 0)).toBe(true);
  });

  it("blocks calls once the max is exceeded within a window", () => {
    const limiter = new FixedWindowRateLimiter({ max: 2, windowMs: 60_000 });
    expect(limiter.check("ip1", 0)).toBe(true);
    expect(limiter.check("ip1", 0)).toBe(true);
    expect(limiter.check("ip1", 0)).toBe(false);
  });

  it("resets after the window elapses", () => {
    const limiter = new FixedWindowRateLimiter({ max: 1, windowMs: 60_000 });
    expect(limiter.check("ip1", 0)).toBe(true);
    expect(limiter.check("ip1", 30_000)).toBe(false);
    expect(limiter.check("ip1", 60_001)).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const limiter = new FixedWindowRateLimiter({ max: 1, windowMs: 60_000 });
    expect(limiter.check("ip1", 0)).toBe(true);
    expect(limiter.check("ip2", 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/auth/rate-limit.test.ts`
Expected: FAIL — no such module.

- [ ] **Step 3: Implement**

```ts filename="src/lib/auth/rate-limit.ts"
interface WindowState {
  count: number;
  windowStart: number;
}

export class FixedWindowRateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly windows = new Map<string, WindowState>();

  constructor(opts: { max: number; windowMs: number }) {
    this.max = opts.max;
    this.windowMs = opts.windowMs;
  }

  check(key: string, now: number = Date.now()): boolean {
    const state = this.windows.get(key);

    if (!state || now - state.windowStart >= this.windowMs) {
      this.windows.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (state.count >= this.max) return false;

    state.count += 1;
    return true;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/auth/rate-limit.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/rate-limit.ts src/lib/auth/rate-limit.test.ts
git commit -m "feat: add in-memory fixed-window rate limiter for login"
```

---

### Task 5: Login/logout routes, `requireSession()`, and `proxy.ts`

**Files:**
- Create: `src/lib/auth/require-session.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/proxy.ts`

**Interfaces:**
- Consumes: `hashPassword`/`verifyPassword` (Task 2), `SESSION_COOKIE_NAME`/`createSessionCookieValue`/`verifySessionCookieValue` (Task 3), `FixedWindowRateLimiter` (Task 4).
- Produces: `requireSession(): Promise<void>` (redirects to `/login` if the session is missing/invalid — every later Server Action and Route Handler calls this first).

This is integration wiring (routes, cookies, redirects) rather than pure logic, so it is verified by running the dev server and exercising login/logout manually rather than by a unit test — the logic it depends on is already unit-tested in Tasks 2–4.

- [ ] **Step 1: Implement `requireSession()`**

```ts filename="src/lib/auth/require-session.ts"
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "./session";

export async function requireSession(): Promise<void> {
  const secret = process.env.OPERATOR_SESSION_SECRET;
  if (!secret) {
    throw new Error("OPERATOR_SESSION_SECRET is not configured");
  }

  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!verifySessionCookieValue(value, secret)) {
    redirect("/login");
  }
}
```

- [ ] **Step 2: Implement the login route**

```ts filename="src/app/api/auth/login/route.ts"
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyPassword } from "../../../../lib/auth/password";
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  createSessionCookieValue,
} from "../../../../lib/auth/session";
import { FixedWindowRateLimiter } from "../../../../lib/auth/rate-limit";

const loginLimiter = new FixedWindowRateLimiter({ max: 5, windowMs: 60_000 });

export async function POST(request: Request) {
  const headerStore = await headers();
  const clientKey = headerStore.get("x-forwarded-for") ?? "unknown";

  if (!loginLimiter.check(clientKey)) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const passwordHash = process.env.OPERATOR_PASSWORD_HASH;
  const sessionSecret = process.env.OPERATOR_SESSION_SECRET;
  if (!passwordHash || !sessionSecret) {
    return NextResponse.json({ error: "Server is not configured" }, { status: 500 });
  }

  const form = await request.formData();
  const password = form.get("password");

  if (typeof password !== "string" || !verifyPassword(password, passwordHash)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, createSessionCookieValue(sessionSecret), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });

  return NextResponse.redirect(new URL("/", request.url));
}
```

- [ ] **Step 3: Implement the logout route**

```ts filename="src/app/api/auth/logout/route.ts"
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../lib/auth/session";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return NextResponse.redirect(new URL("/login", request.url));
}
```

- [ ] **Step 4: Implement the login page**

```tsx filename="src/app/login/page.tsx"
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Vouqis Verify — Operator Login</h1>
      <form action="/api/auth/login" method="POST" className="flex flex-col gap-3">
        <label htmlFor="password" className="text-sm font-medium">
          Operator password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          className="rounded border border-gray-300 px-3 py-2"
        />
        <button
          type="submit"
          className="rounded bg-black px-3 py-2 text-white hover:bg-gray-800"
        >
          Log in
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Implement `proxy.ts` (optimistic redirect only)**

```ts filename="src/proxy.ts"
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "./lib/auth/session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/health" ||
    pathname.startsWith("/_next")
  ) {
    return NextResponse.next();
  }

  const secret = process.env.OPERATOR_SESSION_SECRET;
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!secret || !verifySessionCookieValue(cookieValue, secret)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 6: Manually verify the flow**

Run: `pnpm dotenv -e .env.local -- pnpm dev`, generate a password hash with `pnpm dotenv -e .env.local -- npx tsx scripts/hash-password.ts <password>`, put it in `OPERATOR_PASSWORD_HASH` in `.env.local` along with a random `OPERATOR_SESSION_SECRET` (e.g. `openssl rand -base64 32`), restart, visit `/`, confirm redirect to `/login`, log in, confirm redirect to `/`, then hit `/api/auth/logout` (via a form/button once one exists, or `curl -X POST`) and confirm you're redirected back to `/login`.
Expected: unauthenticated visits to any non-`/login` path bounce to `/login`; a correct password logs in; an incorrect password returns 401 and stays on `/login`; logout clears the cookie.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/require-session.ts src/app/api/auth/login/route.ts src/app/api/auth/logout/route.ts src/app/login/page.tsx src/proxy.ts
git commit -m "feat: add operator login/logout routes and proxy session gate"
```

---

### Task 6: Health check route

**Files:**
- Create: `src/app/api/health/route.ts`

**Interfaces:**
- Consumes: nothing (deliberately unauthenticated, excluded in `proxy.ts` from Task 5).

- [ ] **Step 1: Implement**

```ts filename="src/app/api/health/route.ts"
export async function GET() {
  return Response.json({ status: "ok" });
}
```

- [ ] **Step 2: Verify manually**

Run: `curl http://localhost:3000/api/health`
Expected: `{"status":"ok"}` with no redirect to `/login`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/health/route.ts
git commit -m "feat: add unauthenticated health check route"
```

---

## Milestone M1 — Data model & storage

### Task 7: Shared domain types

**Files:**
- Create: `src/lib/types.ts`

**Interfaces:**
- Produces: every type name listed below. These are the exact names/shapes every later task (schema, classify, store, GitHub import, evidence pack) imports — do not rename any of them in a later task.

- [ ] **Step 1: Implement**

```ts filename="src/lib/types.ts"
export type ChangeStatus = "added" | "modified" | "removed";

export interface ChangedFile {
  path: string;
  status: ChangeStatus;
  additions: number;
  deletions: number;
}

export type ReviewState = "approved" | "changes_requested" | "commented";

export interface ReviewerSummary {
  login: string;
  state: ReviewState;
  submittedAt: string; // ISO timestamp
}

export type CheckConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | null;

export interface CheckSummary {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: CheckConclusion;
  url: string | null;
}

export type AssessmentCategory =
  | "PROMPT"
  | "MODEL_CONFIGURATION"
  | "RETRIEVAL_ACCESS"
  | "TOOL_PERMISSION"
  | "NONE"
  | "NEEDS_HUMAN_REVIEW";

export type AssessmentConfidence = "HIGH" | "MEDIUM" | "LOW";
export type ReviewStatusValue = "PENDING" | "CONFIRMED" | "EXCLUDED";
export type EvidenceStateValue = "COMPLETE" | "MISSING" | "STALE" | "UNAVAILABLE";
export type VerificationStateValue = "PASSED" | "MISSING" | "UNAVAILABLE" | "NOT_APPLICABLE";
export type ImportRunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
}

export interface Repository {
  id: string;
  organizationId: string;
  owner: string;
  name: string;
  installationId: string | null;
  isDemo: boolean;
  active: boolean;
  createdAt: string;
}

export interface ImportRun {
  id: string;
  repositoryId: string;
  periodStart: string;
  periodEnd: string;
  status: ImportRunStatus;
  prCount: number;
  errorMessage: string | null;
  createdAt: string;
}

export interface PullRequestRecord {
  id: string;
  repositoryId: string;
  githubPrNumber: number;
  title: string;
  url: string;
  authorLogin: string;
  mergedAt: string;
  baseRef: string;
  additions: number;
  deletions: number;
  changedFiles: ChangedFile[];
  reviewers: ReviewerSummary[];
  checks: CheckSummary[];
  importedAt: string;
}

export interface Assessment {
  id: string;
  pullRequestId: string;
  category: AssessmentCategory;
  confidence: AssessmentConfidence;
  detectionReasons: string[];
  reviewStatus: ReviewStatusValue;
  reviewerSummary: string | null;
  evidenceState: EvidenceStateValue;
  verificationState: VerificationStateValue;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvidencePackSnapshotRow {
  pullRequest: PullRequestRecord;
  assessment: Assessment;
}

export interface EvidencePackSnapshot {
  organizationName: string;
  repositoryOwner: string;
  repositoryName: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  totals: {
    totalPrsScanned: number;
    nonAiCount: number;
    pendingReviewCount: number;
    confirmedIncludedCount: number;
  };
  rows: EvidencePackSnapshotRow[];
  disclaimer: string;
}

export interface EvidencePackRecord {
  id: string;
  repositoryId: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  prCount: number;
  assessedCount: number;
  snapshot: EvidencePackSnapshot;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: no errors (this file has no logic to unit test — it's types only, exercised by every later task's own tests).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add shared domain types"
```

---

### Task 8: `DataStore` interface

**Files:**
- Create: `src/db/store.ts`

**Interfaces:**
- Consumes: types from Task 7 (`src/lib/types.ts`).
- Produces: the `DataStore` interface and its input/result types below — `InMemoryStore` (Task 10) and `PostgresStore` (Task 11) both implement this exact shape; the import orchestration (Task 16), review UI (Task 21), and evidence-pack builder (Task 22) code against it, never against a concrete store.

- [ ] **Step 1: Implement**

```ts filename="src/db/store.ts"
import type {
  Organization,
  Repository,
  ImportRun,
  ImportRunStatus,
  PullRequestRecord,
  ChangedFile,
  ReviewerSummary,
  CheckSummary,
  Assessment,
  AssessmentCategory,
  AssessmentConfidence,
  ReviewStatusValue,
  EvidenceStateValue,
  VerificationStateValue,
  EvidencePackRecord,
  EvidencePackSnapshot,
} from "../lib/types";

export interface CreateRepositoryInput {
  organizationId: string;
  owner: string;
  name: string;
  installationId: string | null;
  isDemo: boolean;
}

export interface UpsertPullRequestInput {
  repositoryId: string;
  githubPrNumber: number;
  title: string;
  url: string;
  authorLogin: string;
  mergedAt: string;
  baseRef: string;
  additions: number;
  deletions: number;
  changedFiles: ChangedFile[];
  reviewers: ReviewerSummary[];
  checks: CheckSummary[];
}

export interface UpsertPullRequestResult {
  pullRequest: PullRequestRecord;
  isNew: boolean;
}

export interface CreateAssessmentInput {
  pullRequestId: string;
  category: AssessmentCategory;
  confidence: AssessmentConfidence;
  detectionReasons: string[];
}

export interface UpdateAssessmentInput {
  reviewStatus?: ReviewStatusValue;
  category?: AssessmentCategory;
  reviewerSummary?: string | null;
  evidenceState?: EvidenceStateValue;
  verificationState?: VerificationStateValue;
}

export interface PeriodFilter {
  start: string;
  end: string;
}

export interface PullRequestWithAssessments {
  pullRequest: PullRequestRecord;
  assessments: Assessment[];
}

export interface DataStore {
  createOrganization(name: string): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | null>;
  listOrganizations(): Promise<Organization[]>;

  createRepository(input: CreateRepositoryInput): Promise<Repository>;
  getActiveRepository(organizationId: string): Promise<Repository | null>;
  getRepository(id: string): Promise<Repository | null>;

  createImportRun(input: {
    repositoryId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<ImportRun>;
  updateImportRun(
    id: string,
    patch: { status: ImportRunStatus; prCount?: number; errorMessage?: string | null }
  ): Promise<ImportRun>;

  upsertPullRequest(input: UpsertPullRequestInput): Promise<UpsertPullRequestResult>;
  listPullRequestsWithAssessments(
    repositoryId: string,
    period?: PeriodFilter
  ): Promise<PullRequestWithAssessments[]>;
  getPullRequest(id: string): Promise<PullRequestRecord | null>;

  createAssessment(input: CreateAssessmentInput): Promise<Assessment>;
  listAssessments(pullRequestId: string): Promise<Assessment[]>;
  updateAssessment(id: string, patch: UpdateAssessmentInput): Promise<Assessment>;

  createEvidencePack(input: {
    repositoryId: string;
    periodStart: string;
    periodEnd: string;
    prCount: number;
    assessedCount: number;
    snapshot: EvidencePackSnapshot;
  }): Promise<EvidencePackRecord>;
  getEvidencePack(id: string): Promise<EvidencePackRecord | null>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/db/store.ts
git commit -m "feat: define DataStore interface"
```

---

### Task 9: Drizzle schema, client, and migration config

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/client.ts`
- Create: `drizzle.config.ts`

**Interfaces:**
- Consumes: `ChangedFile`, `ReviewerSummary`, `CheckSummary`, `EvidencePackSnapshot` types from Task 7 (for `$type<>` annotations on JSONB columns).
- Produces: `organizations`, `repositories`, `importRuns`, `pullRequests`, `aiChangeAssessments`, `evidencePacks` Drizzle tables + enums; `getDb()` — consumed by Task 11's `PostgresStore`.

- [ ] **Step 1: Implement the schema**

```ts filename="src/db/schema.ts"
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type {
  ChangedFile,
  ReviewerSummary,
  CheckSummary,
  EvidencePackSnapshot,
} from "../lib/types";

export const importRunStatus = pgEnum("import_run_status", [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
]);

export const assessmentCategory = pgEnum("assessment_category", [
  "PROMPT",
  "MODEL_CONFIGURATION",
  "RETRIEVAL_ACCESS",
  "TOOL_PERMISSION",
  "NONE",
  "NEEDS_HUMAN_REVIEW",
]);

export const assessmentConfidence = pgEnum("assessment_confidence", ["HIGH", "MEDIUM", "LOW"]);

export const reviewStatus = pgEnum("review_status", ["PENDING", "CONFIRMED", "EXCLUDED"]);

export const evidenceState = pgEnum("evidence_state", [
  "COMPLETE",
  "MISSING",
  "STALE",
  "UNAVAILABLE",
]);

export const verificationState = pgEnum("verification_state", [
  "PASSED",
  "MISSING",
  "UNAVAILABLE",
  "NOT_APPLICABLE",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    installationId: text("installation_id"),
    isDemo: boolean("is_demo").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("repositories_one_active_per_org")
      .on(table.organizationId)
      .where(sql`${table.active} = true`),
  ]
);

export const importRuns = pgTable("import_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  repositoryId: uuid("repository_id")
    .notNull()
    .references(() => repositories.id),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  status: importRunStatus("status").notNull().default("PENDING"),
  prCount: integer("pr_count").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pullRequests = pgTable(
  "pull_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id),
    githubPrNumber: integer("github_pr_number").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    authorLogin: text("author_login").notNull(),
    mergedAt: timestamp("merged_at", { withTimezone: true }).notNull(),
    baseRef: text("base_ref").notNull(),
    additions: integer("additions").notNull(),
    deletions: integer("deletions").notNull(),
    changedFiles: jsonb("changed_files").notNull().$type<ChangedFile[]>(),
    reviewers: jsonb("reviewers").notNull().$type<ReviewerSummary[]>(),
    checks: jsonb("checks").notNull().$type<CheckSummary[]>(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("pull_requests_repository_id_github_pr_number_key").on(
      table.repositoryId,
      table.githubPrNumber
    ),
  ]
);

export const aiChangeAssessments = pgTable(
  "ai_change_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pullRequestId: uuid("pull_request_id")
      .notNull()
      .references(() => pullRequests.id),
    category: assessmentCategory("category").notNull(),
    confidence: assessmentConfidence("confidence").notNull(),
    detectionReasons: jsonb("detection_reasons").notNull().$type<string[]>(),
    reviewStatus: reviewStatus("review_status").notNull().default("PENDING"),
    reviewerSummary: text("reviewer_summary"),
    evidenceState: evidenceState("evidence_state").notNull().default("MISSING"),
    verificationState: verificationState("verification_state").notNull().default("MISSING"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("ai_change_assessments_pull_request_id_category_key").on(
      table.pullRequestId,
      table.category
    ),
  ]
);

export const evidencePacks = pgTable(
  "evidence_packs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    prCount: integer("pr_count").notNull(),
    assessedCount: integer("assessed_count").notNull(),
    snapshot: jsonb("snapshot").notNull().$type<EvidencePackSnapshot>(),
  },
  (table) => [
    check("evidence_packs_period_check", sql`${table.periodStart} <= ${table.periodEnd}`),
  ]
);
```

- [ ] **Step 2: Implement the lazy DB client**

```ts filename="src/db/client.ts"
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set — getDb() should only be called when it is");
    }
    const client = postgres(connectionString);
    _db = drizzle(client, { schema });
  }
  return _db;
}
```

- [ ] **Step 3: Implement `drizzle.config.ts`**

```ts filename="drizzle.config.ts"
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: no errors. (Migrations against a real Supabase database happen once `DATABASE_URL` exists — see Task 11's manual verification step; this task only needs to typecheck.)

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/client.ts drizzle.config.ts
git commit -m "feat: add Drizzle schema with DB-level integrity constraints"
```

---

### Task 10: `InMemoryStore`

**Files:**
- Create: `src/db/in-memory-store.ts`
- Test: `src/db/in-memory-store.test.ts`

**Interfaces:**
- Consumes: `DataStore` and its input types (Task 8), domain types (Task 7).
- Produces: `class InMemoryStore implements DataStore` — consumed by Task 12's `getStore()`, and directly by Vitest tests in later tasks (Task 16 import orchestration, Task 22 evidence-pack builder) as their test double, so its behavior must faithfully match what `PostgresStore` (Task 11) does.

- [ ] **Step 1: Write the failing tests**

```ts filename="src/db/in-memory-store.test.ts"
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore } from "./in-memory-store";

describe("InMemoryStore", () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  it("creates an organization and a repository", async () => {
    const org = await store.createOrganization("Acme AI");
    const repo = await store.createRepository({
      organizationId: org.id,
      owner: "acme",
      name: "acme-app",
      installationId: null,
      isDemo: true,
    });
    expect(repo.organizationId).toBe(org.id);
    expect(await store.getActiveRepository(org.id)).toEqual(repo);
  });

  it("rejects a second active repository for the same organization", async () => {
    const org = await store.createOrganization("Acme AI");
    await store.createRepository({
      organizationId: org.id,
      owner: "acme",
      name: "repo-one",
      installationId: null,
      isDemo: true,
    });
    await expect(
      store.createRepository({
        organizationId: org.id,
        owner: "acme",
        name: "repo-two",
        installationId: null,
        isDemo: true,
      })
    ).rejects.toThrow(/one active repository/i);
  });

  it("upserts a pull request: first call is new, second call updates and is not new", async () => {
    const org = await store.createOrganization("Acme AI");
    const repo = await store.createRepository({
      organizationId: org.id,
      owner: "acme",
      name: "acme-app",
      installationId: null,
      isDemo: true,
    });

    const input = {
      repositoryId: repo.id,
      githubPrNumber: 42,
      title: "Original title",
      url: "https://github.com/acme/acme-app/pull/42",
      authorLogin: "jane",
      mergedAt: "2026-07-01T00:00:00.000Z",
      baseRef: "main",
      additions: 10,
      deletions: 2,
      changedFiles: [],
      reviewers: [],
      checks: [],
    };

    const first = await store.upsertPullRequest(input);
    expect(first.isNew).toBe(true);

    const second = await store.upsertPullRequest({ ...input, title: "Updated title" });
    expect(second.isNew).toBe(false);
    expect(second.pullRequest.title).toBe("Updated title");
    expect(second.pullRequest.id).toBe(first.pullRequest.id);
  });

  it("re-import upsert does not touch existing assessments (they survive a rescan)", async () => {
    const org = await store.createOrganization("Acme AI");
    const repo = await store.createRepository({
      organizationId: org.id,
      owner: "acme",
      name: "acme-app",
      installationId: null,
      isDemo: true,
    });
    const { pullRequest } = await store.upsertPullRequest({
      repositoryId: repo.id,
      githubPrNumber: 1,
      title: "Prompt tweak",
      url: "https://github.com/acme/acme-app/pull/1",
      authorLogin: "jane",
      mergedAt: "2026-07-01T00:00:00.000Z",
      baseRef: "main",
      additions: 1,
      deletions: 1,
      changedFiles: [],
      reviewers: [],
      checks: [],
    });

    const assessment = await store.createAssessment({
      pullRequestId: pullRequest.id,
      category: "PROMPT",
      confidence: "HIGH",
      detectionReasons: ["path matched prompts/"],
    });
    await store.updateAssessment(assessment.id, {
      reviewStatus: "CONFIRMED",
      reviewerSummary: "Updated the onboarding prompt wording.",
      evidenceState: "COMPLETE",
      verificationState: "PASSED",
    });

    // simulate a re-import of the same PR
    await store.upsertPullRequest({
      repositoryId: repo.id,
      githubPrNumber: 1,
      title: "Prompt tweak",
      url: "https://github.com/acme/acme-app/pull/1",
      authorLogin: "jane",
      mergedAt: "2026-07-01T00:00:00.000Z",
      baseRef: "main",
      additions: 1,
      deletions: 1,
      changedFiles: [],
      reviewers: [],
      checks: [],
    });

    const assessmentsAfterReimport = await store.listAssessments(pullRequest.id);
    expect(assessmentsAfterReimport).toHaveLength(1);
    expect(assessmentsAfterReimport[0].reviewStatus).toBe("CONFIRMED");
    expect(assessmentsAfterReimport[0].evidenceState).toBe("COMPLETE");
  });

  it("new assessments always start PENDING/MISSING, never auto-COMPLETE", async () => {
    const org = await store.createOrganization("Acme AI");
    const repo = await store.createRepository({
      organizationId: org.id,
      owner: "acme",
      name: "acme-app",
      installationId: null,
      isDemo: true,
    });
    const { pullRequest } = await store.upsertPullRequest({
      repositoryId: repo.id,
      githubPrNumber: 2,
      title: "Retrieval filter change",
      url: "https://github.com/acme/acme-app/pull/2",
      authorLogin: "jane",
      mergedAt: "2026-07-01T00:00:00.000Z",
      baseRef: "main",
      additions: 1,
      deletions: 1,
      // an approved review + a passing check is present in the raw data,
      // but the store must never use that to set evidence_state itself
      reviewers: [{ login: "reviewer1", state: "approved", submittedAt: "2026-07-01T00:00:00.000Z" }],
      checks: [{ name: "ci", status: "completed", conclusion: "success", url: null }],
      changedFiles: [],
    });

    const assessment = await store.createAssessment({
      pullRequestId: pullRequest.id,
      category: "RETRIEVAL_ACCESS",
      confidence: "HIGH",
      detectionReasons: ["path matched retrieval/"],
    });

    expect(assessment.reviewStatus).toBe("PENDING");
    expect(assessment.evidenceState).toBe("MISSING");
    expect(assessment.verificationState).toBe("MISSING");
  });

  it("rejects a duplicate (pull_request_id, category) assessment", async () => {
    const org = await store.createOrganization("Acme AI");
    const repo = await store.createRepository({
      organizationId: org.id,
      owner: "acme",
      name: "acme-app",
      installationId: null,
      isDemo: true,
    });
    const { pullRequest } = await store.upsertPullRequest({
      repositoryId: repo.id,
      githubPrNumber: 3,
      title: "Prompt + retrieval",
      url: "https://github.com/acme/acme-app/pull/3",
      authorLogin: "jane",
      mergedAt: "2026-07-01T00:00:00.000Z",
      baseRef: "main",
      additions: 1,
      deletions: 1,
      changedFiles: [],
      reviewers: [],
      checks: [],
    });
    await store.createAssessment({
      pullRequestId: pullRequest.id,
      category: "PROMPT",
      confidence: "HIGH",
      detectionReasons: ["x"],
    });

    await expect(
      store.createAssessment({
        pullRequestId: pullRequest.id,
        category: "PROMPT",
        confidence: "HIGH",
        detectionReasons: ["x"],
      })
    ).rejects.toThrow(/already exists/i);
  });

  it("round-trips an evidence pack", async () => {
    const org = await store.createOrganization("Acme AI");
    const repo = await store.createRepository({
      organizationId: org.id,
      owner: "acme",
      name: "acme-app",
      installationId: null,
      isDemo: true,
    });
    const pack = await store.createEvidencePack({
      repositoryId: repo.id,
      periodStart: "2026-05-01T00:00:00.000Z",
      periodEnd: "2026-07-30T00:00:00.000Z",
      prCount: 10,
      assessedCount: 3,
      snapshot: {
        organizationName: "Acme AI",
        repositoryOwner: "acme",
        repositoryName: "acme-app",
        periodStart: "2026-05-01T00:00:00.000Z",
        periodEnd: "2026-07-30T00:00:00.000Z",
        generatedAt: "2026-07-31T00:00:00.000Z",
        totals: {
          totalPrsScanned: 10,
          nonAiCount: 6,
          pendingReviewCount: 1,
          confirmedIncludedCount: 3,
        },
        rows: [],
        disclaimer: "This pack documents identified AI-relevant code changes and associated GitHub review and verification evidence. It is not a statement that the AI system is safe, compliant, or approved by an auditor.",
      },
    });

    expect(await store.getEvidencePack(pack.id)).toEqual(pack);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/db/in-memory-store.test.ts`
Expected: FAIL — no such module.

- [ ] **Step 3: Implement**

```ts filename="src/db/in-memory-store.ts"
import { randomUUID } from "node:crypto";
import type {
  DataStore,
  CreateRepositoryInput,
  UpsertPullRequestInput,
  UpsertPullRequestResult,
  CreateAssessmentInput,
  UpdateAssessmentInput,
  PeriodFilter,
  PullRequestWithAssessments,
} from "./store";
import type {
  Organization,
  Repository,
  ImportRun,
  ImportRunStatus,
  PullRequestRecord,
  Assessment,
  EvidencePackRecord,
  EvidencePackSnapshot,
} from "../lib/types";

export class InMemoryStore implements DataStore {
  private organizations = new Map<string, Organization>();
  private repositories = new Map<string, Repository>();
  private importRuns = new Map<string, ImportRun>();
  private pullRequests = new Map<string, PullRequestRecord>();
  private assessments = new Map<string, Assessment>();
  private evidencePacks = new Map<string, EvidencePackRecord>();

  async createOrganization(name: string): Promise<Organization> {
    const org: Organization = { id: randomUUID(), name, createdAt: new Date().toISOString() };
    this.organizations.set(org.id, org);
    return org;
  }

  async getOrganization(id: string): Promise<Organization | null> {
    return this.organizations.get(id) ?? null;
  }

  async listOrganizations(): Promise<Organization[]> {
    return [...this.organizations.values()];
  }

  async createRepository(input: CreateRepositoryInput): Promise<Repository> {
    // Every repository this MVP creates is active (there is no code path
    // that creates an inactive one), so this check always applies.
    const existingActive = [...this.repositories.values()].find(
      (r) => r.organizationId === input.organizationId && r.active
    );
    if (existingActive) {
      throw new Error("Organization already has one active repository");
    }
    const repo: Repository = {
      id: randomUUID(),
      organizationId: input.organizationId,
      owner: input.owner,
      name: input.name,
      installationId: input.installationId,
      isDemo: input.isDemo,
      active: true,
      createdAt: new Date().toISOString(),
    };
    this.repositories.set(repo.id, repo);
    return repo;
  }

  async getActiveRepository(organizationId: string): Promise<Repository | null> {
    return (
      [...this.repositories.values()].find(
        (r) => r.organizationId === organizationId && r.active
      ) ?? null
    );
  }

  async getRepository(id: string): Promise<Repository | null> {
    return this.repositories.get(id) ?? null;
  }

  async createImportRun(input: {
    repositoryId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<ImportRun> {
    const run: ImportRun = {
      id: randomUUID(),
      repositoryId: input.repositoryId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: "PENDING",
      prCount: 0,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    };
    this.importRuns.set(run.id, run);
    return run;
  }

  async updateImportRun(
    id: string,
    patch: { status: ImportRunStatus; prCount?: number; errorMessage?: string | null }
  ): Promise<ImportRun> {
    const existing = this.importRuns.get(id);
    if (!existing) throw new Error(`Import run ${id} not found`);
    const updated: ImportRun = {
      ...existing,
      status: patch.status,
      prCount: patch.prCount ?? existing.prCount,
      errorMessage: patch.errorMessage === undefined ? existing.errorMessage : patch.errorMessage,
    };
    this.importRuns.set(id, updated);
    return updated;
  }

  async upsertPullRequest(input: UpsertPullRequestInput): Promise<UpsertPullRequestResult> {
    const existing = [...this.pullRequests.values()].find(
      (pr) => pr.repositoryId === input.repositoryId && pr.githubPrNumber === input.githubPrNumber
    );

    if (existing) {
      const updated: PullRequestRecord = {
        ...existing,
        title: input.title,
        url: input.url,
        authorLogin: input.authorLogin,
        mergedAt: input.mergedAt,
        baseRef: input.baseRef,
        additions: input.additions,
        deletions: input.deletions,
        changedFiles: input.changedFiles,
        reviewers: input.reviewers,
        checks: input.checks,
        importedAt: new Date().toISOString(),
      };
      this.pullRequests.set(existing.id, updated);
      return { pullRequest: updated, isNew: false };
    }

    const created: PullRequestRecord = {
      id: randomUUID(),
      repositoryId: input.repositoryId,
      githubPrNumber: input.githubPrNumber,
      title: input.title,
      url: input.url,
      authorLogin: input.authorLogin,
      mergedAt: input.mergedAt,
      baseRef: input.baseRef,
      additions: input.additions,
      deletions: input.deletions,
      changedFiles: input.changedFiles,
      reviewers: input.reviewers,
      checks: input.checks,
      importedAt: new Date().toISOString(),
    };
    this.pullRequests.set(created.id, created);
    return { pullRequest: created, isNew: true };
  }

  async listPullRequestsWithAssessments(
    repositoryId: string,
    period?: PeriodFilter
  ): Promise<PullRequestWithAssessments[]> {
    const prs = [...this.pullRequests.values()].filter((pr) => {
      if (pr.repositoryId !== repositoryId) return false;
      if (!period) return true;
      return pr.mergedAt >= period.start && pr.mergedAt <= period.end;
    });

    return prs.map((pullRequest) => ({
      pullRequest,
      assessments: [...this.assessments.values()].filter(
        (a) => a.pullRequestId === pullRequest.id
      ),
    }));
  }

  async getPullRequest(id: string): Promise<PullRequestRecord | null> {
    return this.pullRequests.get(id) ?? null;
  }

  async createAssessment(input: CreateAssessmentInput): Promise<Assessment> {
    const duplicate = [...this.assessments.values()].find(
      (a) => a.pullRequestId === input.pullRequestId && a.category === input.category
    );
    if (duplicate) {
      throw new Error(
        `An assessment for category ${input.category} already exists on pull request ${input.pullRequestId}`
      );
    }

    const now = new Date().toISOString();
    const assessment: Assessment = {
      id: randomUUID(),
      pullRequestId: input.pullRequestId,
      category: input.category,
      confidence: input.confidence,
      detectionReasons: input.detectionReasons,
      reviewStatus: "PENDING",
      reviewerSummary: null,
      evidenceState: "MISSING",
      verificationState: "MISSING",
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.assessments.set(assessment.id, assessment);
    return assessment;
  }

  async listAssessments(pullRequestId: string): Promise<Assessment[]> {
    return [...this.assessments.values()].filter((a) => a.pullRequestId === pullRequestId);
  }

  async updateAssessment(id: string, patch: UpdateAssessmentInput): Promise<Assessment> {
    const existing = this.assessments.get(id);
    if (!existing) throw new Error(`Assessment ${id} not found`);

    const now = new Date().toISOString();
    const updated: Assessment = {
      ...existing,
      reviewStatus: patch.reviewStatus ?? existing.reviewStatus,
      category: patch.category ?? existing.category,
      reviewerSummary: patch.reviewerSummary === undefined ? existing.reviewerSummary : patch.reviewerSummary,
      evidenceState: patch.evidenceState ?? existing.evidenceState,
      verificationState: patch.verificationState ?? existing.verificationState,
      reviewedAt: now,
      updatedAt: now,
    };
    this.assessments.set(id, updated);
    return updated;
  }

  async createEvidencePack(input: {
    repositoryId: string;
    periodStart: string;
    periodEnd: string;
    prCount: number;
    assessedCount: number;
    snapshot: EvidencePackSnapshot;
  }): Promise<EvidencePackRecord> {
    const pack: EvidencePackRecord = {
      id: randomUUID(),
      repositoryId: input.repositoryId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      generatedAt: new Date().toISOString(),
      prCount: input.prCount,
      assessedCount: input.assessedCount,
      snapshot: input.snapshot,
    };
    this.evidencePacks.set(pack.id, pack);
    return pack;
  }

  async getEvidencePack(id: string): Promise<EvidencePackRecord | null> {
    return this.evidencePacks.get(id) ?? null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/db/in-memory-store.test.ts`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add src/db/in-memory-store.ts src/db/in-memory-store.test.ts
git commit -m "feat: add InMemoryStore implementing DataStore"
```

---

### Task 11: `PostgresStore`

**Files:**
- Create: `src/db/postgres-store.ts`
- Test: `src/db/postgres-store.test.ts` (integration test, only runs when `DATABASE_URL` is set)

**Interfaces:**
- Consumes: `getDb()` (Task 9), Drizzle schema tables (Task 9), `DataStore` (Task 8).
- Produces: `class PostgresStore implements DataStore` — the production implementation selected by Task 12's `getStore()` whenever `DATABASE_URL` is set.

This is the one place spec test case 12 ("duplicate `(pull_request_id, category)` is rejected") is meaningfully exercised, because only a real Postgres unique constraint proves the DB — not just the app — enforces it.

- [ ] **Step 1: Write the integration test (skips itself without a database)**

```ts filename="src/db/postgres-store.test.ts"
import { describe, it, expect, beforeAll } from "vitest";
import { PostgresStore } from "./postgres-store";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("PostgresStore (requires DATABASE_URL against a migrated test database)", () => {
  let store: PostgresStore;

  beforeAll(() => {
    store = new PostgresStore();
  });

  it("rejects a duplicate (pull_request_id, category) assessment at the database level", async () => {
    const org = await store.createOrganization("Integration Test Org");
    const repo = await store.createRepository({
      organizationId: org.id,
      owner: "acme",
      name: "acme-app-" + Date.now(),
      installationId: null,
      isDemo: true,
    });
    const { pullRequest } = await store.upsertPullRequest({
      repositoryId: repo.id,
      githubPrNumber: 1,
      title: "Prompt change",
      url: "https://github.com/acme/acme-app/pull/1",
      authorLogin: "jane",
      mergedAt: "2026-07-01T00:00:00.000Z",
      baseRef: "main",
      additions: 1,
      deletions: 1,
      changedFiles: [],
      reviewers: [],
      checks: [],
    });
    await store.createAssessment({
      pullRequestId: pullRequest.id,
      category: "PROMPT",
      confidence: "HIGH",
      detectionReasons: ["x"],
    });

    await expect(
      store.createAssessment({
        pullRequestId: pullRequest.id,
        category: "PROMPT",
        confidence: "HIGH",
        detectionReasons: ["x"],
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Implement**

```ts filename="src/db/postgres-store.ts"
import { eq, and, gte, lte } from "drizzle-orm";
import { getDb } from "./client";
import {
  organizations,
  repositories,
  importRuns,
  pullRequests,
  aiChangeAssessments,
  evidencePacks,
} from "./schema";
import type {
  DataStore,
  CreateRepositoryInput,
  UpsertPullRequestInput,
  UpsertPullRequestResult,
  CreateAssessmentInput,
  UpdateAssessmentInput,
  PeriodFilter,
  PullRequestWithAssessments,
} from "./store";
import type {
  Organization,
  Repository,
  ImportRun,
  ImportRunStatus,
  PullRequestRecord,
  Assessment,
  EvidencePackRecord,
  EvidencePackSnapshot,
} from "../lib/types";

export class PostgresStore implements DataStore {
  private get db() {
    return getDb();
  }

  async createOrganization(name: string): Promise<Organization> {
    const [row] = await this.db.insert(organizations).values({ name }).returning();
    return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString() };
  }

  async getOrganization(id: string): Promise<Organization | null> {
    const [row] = await this.db.select().from(organizations).where(eq(organizations.id, id));
    return row ? { id: row.id, name: row.name, createdAt: row.createdAt.toISOString() } : null;
  }

  async listOrganizations(): Promise<Organization[]> {
    const rows = await this.db.select().from(organizations);
    return rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.createdAt.toISOString() }));
  }

  async createRepository(input: CreateRepositoryInput): Promise<Repository> {
    const [row] = await this.db
      .insert(repositories)
      .values({
        organizationId: input.organizationId,
        owner: input.owner,
        name: input.name,
        installationId: input.installationId,
        isDemo: input.isDemo,
        active: true,
      })
      .returning();
    return this.toRepository(row);
  }

  async getActiveRepository(organizationId: string): Promise<Repository | null> {
    const [row] = await this.db
      .select()
      .from(repositories)
      .where(and(eq(repositories.organizationId, organizationId), eq(repositories.active, true)));
    return row ? this.toRepository(row) : null;
  }

  async getRepository(id: string): Promise<Repository | null> {
    const [row] = await this.db.select().from(repositories).where(eq(repositories.id, id));
    return row ? this.toRepository(row) : null;
  }

  private toRepository(row: typeof repositories.$inferSelect): Repository {
    return {
      id: row.id,
      organizationId: row.organizationId,
      owner: row.owner,
      name: row.name,
      installationId: row.installationId,
      isDemo: row.isDemo,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createImportRun(input: {
    repositoryId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<ImportRun> {
    const [row] = await this.db
      .insert(importRuns)
      .values({
        repositoryId: input.repositoryId,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
      })
      .returning();
    return this.toImportRun(row);
  }

  async updateImportRun(
    id: string,
    patch: { status: ImportRunStatus; prCount?: number; errorMessage?: string | null }
  ): Promise<ImportRun> {
    const [row] = await this.db
      .update(importRuns)
      .set({
        status: patch.status,
        ...(patch.prCount !== undefined ? { prCount: patch.prCount } : {}),
        ...(patch.errorMessage !== undefined ? { errorMessage: patch.errorMessage } : {}),
      })
      .where(eq(importRuns.id, id))
      .returning();
    return this.toImportRun(row);
  }

  private toImportRun(row: typeof importRuns.$inferSelect): ImportRun {
    return {
      id: row.id,
      repositoryId: row.repositoryId,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      status: row.status,
      prCount: row.prCount,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async upsertPullRequest(input: UpsertPullRequestInput): Promise<UpsertPullRequestResult> {
    const [existing] = await this.db
      .select()
      .from(pullRequests)
      .where(
        and(
          eq(pullRequests.repositoryId, input.repositoryId),
          eq(pullRequests.githubPrNumber, input.githubPrNumber)
        )
      );

    const values = {
      title: input.title,
      url: input.url,
      authorLogin: input.authorLogin,
      mergedAt: new Date(input.mergedAt),
      baseRef: input.baseRef,
      additions: input.additions,
      deletions: input.deletions,
      changedFiles: input.changedFiles,
      reviewers: input.reviewers,
      checks: input.checks,
      importedAt: new Date(),
    };

    if (existing) {
      const [row] = await this.db
        .update(pullRequests)
        .set(values)
        .where(eq(pullRequests.id, existing.id))
        .returning();
      return { pullRequest: this.toPullRequest(row), isNew: false };
    }

    const [row] = await this.db
      .insert(pullRequests)
      .values({
        repositoryId: input.repositoryId,
        githubPrNumber: input.githubPrNumber,
        ...values,
      })
      .returning();
    return { pullRequest: this.toPullRequest(row), isNew: true };
  }

  private toPullRequest(row: typeof pullRequests.$inferSelect): PullRequestRecord {
    return {
      id: row.id,
      repositoryId: row.repositoryId,
      githubPrNumber: row.githubPrNumber,
      title: row.title,
      url: row.url,
      authorLogin: row.authorLogin,
      mergedAt: row.mergedAt.toISOString(),
      baseRef: row.baseRef,
      additions: row.additions,
      deletions: row.deletions,
      changedFiles: row.changedFiles,
      reviewers: row.reviewers,
      checks: row.checks,
      importedAt: row.importedAt.toISOString(),
    };
  }

  async listPullRequestsWithAssessments(
    repositoryId: string,
    period?: PeriodFilter
  ): Promise<PullRequestWithAssessments[]> {
    const conditions = [eq(pullRequests.repositoryId, repositoryId)];
    if (period) {
      conditions.push(gte(pullRequests.mergedAt, new Date(period.start)));
      conditions.push(lte(pullRequests.mergedAt, new Date(period.end)));
    }
    const prRows = await this.db.select().from(pullRequests).where(and(...conditions));

    const results: PullRequestWithAssessments[] = [];
    for (const prRow of prRows) {
      const assessmentRows = await this.db
        .select()
        .from(aiChangeAssessments)
        .where(eq(aiChangeAssessments.pullRequestId, prRow.id));
      results.push({
        pullRequest: this.toPullRequest(prRow),
        assessments: assessmentRows.map((a) => this.toAssessment(a)),
      });
    }
    return results;
  }

  async getPullRequest(id: string): Promise<PullRequestRecord | null> {
    const [row] = await this.db.select().from(pullRequests).where(eq(pullRequests.id, id));
    return row ? this.toPullRequest(row) : null;
  }

  async createAssessment(input: CreateAssessmentInput): Promise<Assessment> {
    const [row] = await this.db
      .insert(aiChangeAssessments)
      .values({
        pullRequestId: input.pullRequestId,
        category: input.category,
        confidence: input.confidence,
        detectionReasons: input.detectionReasons,
      })
      .returning();
    return this.toAssessment(row);
  }

  async listAssessments(pullRequestId: string): Promise<Assessment[]> {
    const rows = await this.db
      .select()
      .from(aiChangeAssessments)
      .where(eq(aiChangeAssessments.pullRequestId, pullRequestId));
    return rows.map((r) => this.toAssessment(r));
  }

  async updateAssessment(id: string, patch: UpdateAssessmentInput): Promise<Assessment> {
    const [row] = await this.db
      .update(aiChangeAssessments)
      .set({
        ...(patch.reviewStatus !== undefined ? { reviewStatus: patch.reviewStatus } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.reviewerSummary !== undefined ? { reviewerSummary: patch.reviewerSummary } : {}),
        ...(patch.evidenceState !== undefined ? { evidenceState: patch.evidenceState } : {}),
        ...(patch.verificationState !== undefined
          ? { verificationState: patch.verificationState }
          : {}),
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiChangeAssessments.id, id))
      .returning();
    return this.toAssessment(row);
  }

  private toAssessment(row: typeof aiChangeAssessments.$inferSelect): Assessment {
    return {
      id: row.id,
      pullRequestId: row.pullRequestId,
      category: row.category,
      confidence: row.confidence,
      detectionReasons: row.detectionReasons,
      reviewStatus: row.reviewStatus,
      reviewerSummary: row.reviewerSummary,
      evidenceState: row.evidenceState,
      verificationState: row.verificationState,
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async createEvidencePack(input: {
    repositoryId: string;
    periodStart: string;
    periodEnd: string;
    prCount: number;
    assessedCount: number;
    snapshot: EvidencePackSnapshot;
  }): Promise<EvidencePackRecord> {
    const [row] = await this.db
      .insert(evidencePacks)
      .values({
        repositoryId: input.repositoryId,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        prCount: input.prCount,
        assessedCount: input.assessedCount,
        snapshot: input.snapshot,
      })
      .returning();
    return this.toEvidencePack(row);
  }

  async getEvidencePack(id: string): Promise<EvidencePackRecord | null> {
    const [row] = await this.db.select().from(evidencePacks).where(eq(evidencePacks.id, id));
    return row ? this.toEvidencePack(row) : null;
  }

  private toEvidencePack(row: typeof evidencePacks.$inferSelect): EvidencePackRecord {
    return {
      id: row.id,
      repositoryId: row.repositoryId,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      generatedAt: row.generatedAt.toISOString(),
      prCount: row.prCount,
      assessedCount: row.assessedCount,
      snapshot: row.snapshot,
    };
  }
}
```

- [ ] **Step 3: Provision Supabase and run migrations (manual, one-time)**

Create the Supabase project, copy its Postgres connection string into `DATABASE_URL` in `.env.local`, then:

Run: `pnpm dotenv -e .env.local -- npx drizzle-kit push`
Expected: all six tables plus enums and constraints from Task 9's schema are created in Supabase.

- [ ] **Step 4: Run the integration test against that database**

Run: `pnpm dotenv -e .env.local -- pnpm vitest run src/db/postgres-store.test.ts`
Expected: PASS — the duplicate-category insert is rejected by Postgres's unique constraint, proving §5's DB-level integrity guarantee actually holds (not just the app-level checks `InMemoryStore` emulates).

- [ ] **Step 5: Commit**

```bash
git add src/db/postgres-store.ts src/db/postgres-store.test.ts
git commit -m "feat: add PostgresStore implementing DataStore against Supabase"
```

---

### Task 12: `getStore()` selector

**Files:**
- Create: `src/db/get-store.ts`

**Interfaces:**
- Consumes: `InMemoryStore` (Task 10), `PostgresStore` (Task 11), `DataStore` (Task 8).
- Produces: `getStore(): DataStore` — every Server Action / Route Handler in later tasks calls this instead of constructing a store directly.

- [ ] **Step 1: Implement**

```ts filename="src/db/get-store.ts"
import type { DataStore } from "./store";
import { InMemoryStore } from "./in-memory-store";
import { PostgresStore } from "./postgres-store";

let _store: DataStore | null = null;

export function getStore(): DataStore {
  if (!_store) {
    _store = process.env.DATABASE_URL ? new PostgresStore() : new InMemoryStore();
  }
  return _store;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/db/get-store.ts
git commit -m "feat: add getStore() DATABASE_URL-based store selector"
```

---

## Milestone M2 — Classification engine

### Task 13: Classification rules and `classify()`

**Files:**
- Create: `src/lib/classification/rules.ts`
- Create: `src/lib/classification/classify.ts`
- Test: `src/lib/classification/classify.test.ts`

**Interfaces:**
- Consumes: `AssessmentCategory`, `AssessmentConfidence` types (Task 7).
- Produces: `classify(input: { title: string; changedFiles: { path: string }[] }): ClassifyResult[]` where `ClassifyResult = { category: AssessmentCategory; confidence: AssessmentConfidence; detectionReasons: string[] }` — consumed by Task 16's import orchestration.

This is the single most important pure-logic unit in the product (§8 of the spec plus the "provider.ts" amendment), so it gets full TDD coverage of every required case.

- [ ] **Step 1: Write the failing tests**

```ts filename="src/lib/classification/classify.test.ts"
import { describe, it, expect } from "vitest";
import { classify } from "./classify";

describe("classify", () => {
  it("flags a prompt file as PROMPT with HIGH confidence", () => {
    const result = classify({
      title: "Update onboarding prompt copy",
      changedFiles: [{ path: "src/prompts/onboarding.md" }],
    });
    expect(result).toEqual([
      expect.objectContaining({ category: "PROMPT", confidence: "HIGH" }),
    ]);
  });

  it("flags a model configuration file as MODEL_CONFIGURATION with HIGH confidence", () => {
    const result = classify({
      title: "Bump default temperature",
      changedFiles: [{ path: "src/models/model.config.ts" }],
    });
    expect(result).toEqual([
      expect.objectContaining({ category: "MODEL_CONFIGURATION", confidence: "HIGH" }),
    ]);
  });

  it("flags a retrieval/access file as RETRIEVAL_ACCESS", () => {
    const result = classify({
      title: "Tighten vector store access filter",
      changedFiles: [{ path: "src/retrieval/filters.ts" }],
    });
    expect(result).toEqual([
      expect.objectContaining({ category: "RETRIEVAL_ACCESS", confidence: "HIGH" }),
    ]);
  });

  it("flags a tool/permission file as TOOL_PERMISSION", () => {
    const result = classify({
      title: "Restrict MCP tool scopes",
      changedFiles: [{ path: "src/mcp.json" }],
    });
    expect(result).toEqual([
      expect.objectContaining({ category: "TOOL_PERMISSION", confidence: "HIGH" }),
    ]);
  });

  it("classifies an ordinary UI PR as NONE", () => {
    const result = classify({
      title: "Fix button alignment on settings page",
      changedFiles: [{ path: "src/components/SettingsButton.tsx" }],
    });
    expect(result).toEqual([expect.objectContaining({ category: "NONE" })]);
  });

  it("classifies a lockfile-only dependency bump as NONE, not a false positive", () => {
    const result = classify({
      title: "Bump openai from 4.1.0 to 4.2.0",
      changedFiles: [{ path: "package.json" }, { path: "pnpm-lock.yaml" }],
    });
    expect(result).toEqual([expect.objectContaining({ category: "NONE" })]);
  });

  it("returns one assessment per category when a PR touches multiple AI surfaces", () => {
    const result = classify({
      title: "Adjust prompt and retrieval filter together",
      changedFiles: [
        { path: "src/prompts/system.md" },
        { path: "src/retrieval/filters.ts" },
      ],
    });
    expect(result.map((r) => r.category).sort()).toEqual(["PROMPT", "RETRIEVAL_ACCESS"]);
  });

  it("flags an ambiguous generic file as NEEDS_HUMAN_REVIEW", () => {
    const result = classify({
      title: "Update schema",
      changedFiles: [{ path: "src/schema.ts" }],
    });
    expect(result).toEqual([
      expect.objectContaining({ category: "NEEDS_HUMAN_REVIEW", confidence: "LOW" }),
    ]);
  });

  it("keeps a bare provider.ts at MEDIUM confidence without corroboration", () => {
    const result = classify({
      title: "Refactor provider wiring",
      changedFiles: [{ path: "src/provider.ts" }],
    });
    expect(result).toEqual([
      expect.objectContaining({ category: "MODEL_CONFIGURATION", confidence: "MEDIUM" }),
    ]);
  });

  it("promotes provider.ts to HIGH when the title corroborates a model change", () => {
    const result = classify({
      title: "Switch to gpt-4o via provider.ts",
      changedFiles: [{ path: "src/provider.ts" }],
    });
    expect(result).toEqual([
      expect.objectContaining({ category: "MODEL_CONFIGURATION", confidence: "HIGH" }),
    ]);
  });

  it("promotes provider.ts to HIGH when it lives inside a dedicated model directory", () => {
    const result = classify({
      title: "Refactor provider wiring",
      changedFiles: [{ path: "src/models/provider.ts" }],
    });
    expect(result).toEqual([
      expect.objectContaining({ category: "MODEL_CONFIGURATION", confidence: "HIGH" }),
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/classification/classify.test.ts`
Expected: FAIL — no such module.

- [ ] **Step 3: Implement the rules**

```ts filename="src/lib/classification/rules.ts"
import type { AssessmentCategory } from "../types";

export interface CategoryRule {
  category: Exclude<AssessmentCategory, "NONE" | "NEEDS_HUMAN_REVIEW">;
  pathPatterns: RegExp[];
  titleKeywords: string[];
}

export const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "PROMPT",
    pathPatterns: [/(^|\/)prompts?\//i, /system[_-]?prompt/i, /(^|\/)instructions?\.\w+$/i],
    titleKeywords: ["prompt", "system message"],
  },
  {
    category: "MODEL_CONFIGURATION",
    pathPatterns: [
      /model\.config\./i,
      /llm\.config\./i,
      /(^|\/)(models?|llm|ai)\/.*config/i,
      /(^|\/)provider\.\w+$/i,
    ],
    titleKeywords: [
      "model",
      "provider",
      "temperature",
      "max_tokens",
      "switch to gpt",
      "switch to claude",
      "switch to gemini",
    ],
  },
  {
    category: "RETRIEVAL_ACCESS",
    pathPatterns: [
      /(^|\/)retrieval\//i,
      /(^|\/)rag\//i,
      /(^|\/)vectorstore\//i,
      /(^|\/)embeddings?\//i,
      /(^|\/)index\//i,
    ],
    titleKeywords: ["retrieval", "rag", "vector", "embedding", "chunk", "access control"],
  },
  {
    category: "TOOL_PERMISSION",
    pathPatterns: [
      /(^|\/)agents?\//i,
      /(^|\/)tools?\//i,
      /mcp\.json$/i,
      /permissions?\.ya?ml$/i,
      /scopes\.json$/i,
    ],
    titleKeywords: ["agent", "tool", "mcp", "permission", "scope"],
  },
];

export const DEPENDENCY_MANIFEST_BASENAMES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "requirements.txt",
  "Pipfile.lock",
  "go.sum",
  "Gemfile.lock",
]);

export const AMBIGUOUS_PATTERNS: RegExp[] = [
  /(^|\/)schema\.\w+$/i,
  /(^|\/)config\.\w+$/i,
  /(^|\/)settings\.\w+$/i,
];

const BARE_PROVIDER_PATTERN = /(^|\/)provider\.\w+$/i;
const DEDICATED_AI_DIR_PATTERN = /(^|\/)(models?|llm|ai)\//i;

export function isBareProviderFile(path: string): boolean {
  return BARE_PROVIDER_PATTERN.test(path) && !DEDICATED_AI_DIR_PATTERN.test(path);
}

function basename(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1];
}

export function isDependencyOnlyChange(paths: string[]): boolean {
  return paths.length > 0 && paths.every((p) => DEPENDENCY_MANIFEST_BASENAMES.has(basename(p)));
}
```

- [ ] **Step 4: Implement `classify()`**

```ts filename="src/lib/classification/classify.ts"
import type { AssessmentCategory, AssessmentConfidence } from "../types";
import {
  CATEGORY_RULES,
  AMBIGUOUS_PATTERNS,
  isBareProviderFile,
  isDependencyOnlyChange,
} from "./rules";

export interface ClassifyInput {
  title: string;
  changedFiles: { path: string }[];
}

export interface ClassifyResult {
  category: AssessmentCategory;
  confidence: AssessmentConfidence;
  detectionReasons: string[];
}

export function classify({ title, changedFiles }: ClassifyInput): ClassifyResult[] {
  const paths = changedFiles.map((f) => f.path);
  const lowerTitle = title.toLowerCase();

  if (isDependencyOnlyChange(paths)) {
    return [
      {
        category: "NONE",
        confidence: "HIGH",
        detectionReasons: ["only dependency manifest/lockfile files changed"],
      },
    ];
  }

  const results: ClassifyResult[] = [];

  for (const rule of CATEGORY_RULES) {
    const pathHit = paths.find((p) => rule.pathPatterns.some((re) => re.test(p)));
    const titleHit = rule.titleKeywords.find((kw) => lowerTitle.includes(kw.toLowerCase()));

    if (!pathHit && !titleHit) continue;

    let confidence: AssessmentConfidence = pathHit ? "HIGH" : "MEDIUM";
    const reasons: string[] = [];
    if (pathHit) reasons.push(`path matched: ${pathHit}`);
    if (titleHit) reasons.push(`title matched keyword "${titleHit}"`);

    if (rule.category === "MODEL_CONFIGURATION" && pathHit && isBareProviderFile(pathHit)) {
      const corroboratedByAnotherFile = paths.some(
        (p) =>
          p !== pathHit &&
          rule.pathPatterns.some((re) => re.test(p)) &&
          !isBareProviderFile(p)
      );
      const corroborated = Boolean(titleHit) || corroboratedByAnotherFile;
      confidence = corroborated ? "HIGH" : "MEDIUM";
      if (!corroborated) {
        reasons.push(
          "provider.ts alone is treated as generic wiring, not a confirmed model-config change"
        );
      }
    }

    results.push({ category: rule.category, confidence, detectionReasons: reasons });
  }

  if (results.length > 0) return results;

  if (paths.some((p) => AMBIGUOUS_PATTERNS.some((re) => re.test(p)))) {
    return [
      {
        category: "NEEDS_HUMAN_REVIEW",
        confidence: "LOW",
        detectionReasons: ["generic/low-signal file with no confident category match"],
      },
    ];
  }

  return [
    {
      category: "NONE",
      confidence: "HIGH",
      detectionReasons: ["no AI-relevant path/title signals found"],
    },
  ];
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/classification/classify.test.ts`
Expected: PASS (11/11)

- [ ] **Step 6: Commit**

```bash
git add src/lib/classification/rules.ts src/lib/classification/classify.ts src/lib/classification/classify.test.ts
git commit -m "feat: add rules-based AI-change classifier"
```

---

## Milestone M3 — Demo mode & import orchestration

### Task 14: Demo PR fixture

**Files:**
- Create: `src/lib/github/demo-fixture.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DEMO_PULL_REQUESTS: DemoPullRequest[]` where `DemoPullRequest = Omit<UpsertPullRequestInput, "repositoryId">` (Task 8's type) — consumed by Task 16's import orchestration when the operator picks "Demo data".

- [ ] **Step 1: Implement**

Twelve realistic PRs covering every classify() outcome (prompt, model-config incl. a bare `provider.ts` case, retrieval, tool/permission, multi-category, plain NONE, dependency-bump NONE, and an ambiguous `NEEDS_HUMAN_REVIEW` case), all merged within the same illustrative 90-day window. Pad with a few more similarly-shaped entries at implementation time to better approximate the ~15–20 the spec calls out — the category coverage below is what the E2E test (Task 25) and manual demo depend on, not the exact count.

```ts filename="src/lib/github/demo-fixture.ts"
import type { UpsertPullRequestInput } from "../../db/store";

export type DemoPullRequest = Omit<UpsertPullRequestInput, "repositoryId">;

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

export const DEMO_PULL_REQUESTS: DemoPullRequest[] = [
  {
    githubPrNumber: 401,
    title: "Rewrite onboarding system prompt for clarity",
    url: "https://github.com/demo/acme-app/pull/401",
    authorLogin: "priya",
    mergedAt: daysAgo(5),
    baseRef: "main",
    additions: 40,
    deletions: 12,
    changedFiles: [
      { path: "src/prompts/onboarding-system-prompt.md", status: "modified", additions: 40, deletions: 12 },
    ],
    reviewers: [{ login: "sam", state: "approved", submittedAt: daysAgo(5) }],
    checks: [{ name: "ci", status: "completed", conclusion: "success", url: null }],
  },
  {
    githubPrNumber: 402,
    title: "Switch default model to gpt-4o",
    url: "https://github.com/demo/acme-app/pull/402",
    authorLogin: "sam",
    mergedAt: daysAgo(10),
    baseRef: "main",
    additions: 8,
    deletions: 8,
    changedFiles: [
      { path: "src/models/model.config.ts", status: "modified", additions: 8, deletions: 8 },
    ],
    reviewers: [{ login: "priya", state: "approved", submittedAt: daysAgo(10) }],
    checks: [{ name: "ci", status: "completed", conclusion: "success", url: null }],
  },
  {
    githubPrNumber: 403,
    title: "Refactor provider wiring",
    url: "https://github.com/demo/acme-app/pull/403",
    authorLogin: "priya",
    mergedAt: daysAgo(12),
    baseRef: "main",
    additions: 15,
    deletions: 20,
    changedFiles: [{ path: "src/provider.ts", status: "modified", additions: 15, deletions: 20 }],
    reviewers: [{ login: "sam", state: "commented", submittedAt: daysAgo(12) }],
    checks: [{ name: "ci", status: "completed", conclusion: "success", url: null }],
  },
  {
    githubPrNumber: 404,
    title: "Tighten retrieval access filter for tenant isolation",
    url: "https://github.com/demo/acme-app/pull/404",
    authorLogin: "sam",
    mergedAt: daysAgo(18),
    baseRef: "main",
    additions: 60,
    deletions: 5,
    changedFiles: [
      { path: "src/retrieval/filters.ts", status: "modified", additions: 60, deletions: 5 },
    ],
    reviewers: [{ login: "priya", state: "approved", submittedAt: daysAgo(18) }],
    checks: [{ name: "ci", status: "completed", conclusion: "failure", url: null }],
  },
  {
    githubPrNumber: 405,
    title: "Restrict MCP tool scopes to read-only",
    url: "https://github.com/demo/acme-app/pull/405",
    authorLogin: "priya",
    mergedAt: daysAgo(22),
    baseRef: "main",
    additions: 12,
    deletions: 3,
    changedFiles: [{ path: "src/mcp.json", status: "modified", additions: 12, deletions: 3 }],
    reviewers: [{ login: "sam", state: "approved", submittedAt: daysAgo(22) }],
    checks: [{ name: "ci", status: "completed", conclusion: "success", url: null }],
  },
  {
    githubPrNumber: 406,
    title: "Prompt and retrieval filter updated together for the support bot",
    url: "https://github.com/demo/acme-app/pull/406",
    authorLogin: "sam",
    mergedAt: daysAgo(28),
    baseRef: "main",
    additions: 90,
    deletions: 30,
    changedFiles: [
      { path: "src/prompts/support-bot.md", status: "modified", additions: 50, deletions: 10 },
      { path: "src/retrieval/index.ts", status: "modified", additions: 40, deletions: 20 },
    ],
    reviewers: [{ login: "priya", state: "approved", submittedAt: daysAgo(28) }],
    checks: [{ name: "ci", status: "completed", conclusion: "success", url: null }],
  },
  {
    githubPrNumber: 407,
    title: "Fix button alignment on settings page",
    url: "https://github.com/demo/acme-app/pull/407",
    authorLogin: "priya",
    mergedAt: daysAgo(30),
    baseRef: "main",
    additions: 4,
    deletions: 4,
    changedFiles: [
      { path: "src/components/SettingsButton.tsx", status: "modified", additions: 4, deletions: 4 },
    ],
    reviewers: [{ login: "sam", state: "approved", submittedAt: daysAgo(30) }],
    checks: [{ name: "ci", status: "completed", conclusion: "success", url: null }],
  },
  {
    githubPrNumber: 408,
    title: "Bump openai from 4.1.0 to 4.2.0",
    url: "https://github.com/demo/acme-app/pull/408",
    authorLogin: "dependabot",
    mergedAt: daysAgo(33),
    baseRef: "main",
    additions: 6,
    deletions: 6,
    changedFiles: [
      { path: "package.json", status: "modified", additions: 1, deletions: 1 },
      { path: "pnpm-lock.yaml", status: "modified", additions: 5, deletions: 5 },
    ],
    reviewers: [{ login: "sam", state: "approved", submittedAt: daysAgo(33) }],
    checks: [{ name: "ci", status: "completed", conclusion: "success", url: null }],
  },
  {
    githubPrNumber: 409,
    title: "Update schema",
    url: "https://github.com/demo/acme-app/pull/409",
    authorLogin: "sam",
    mergedAt: daysAgo(40),
    baseRef: "main",
    additions: 22,
    deletions: 3,
    changedFiles: [{ path: "src/schema.ts", status: "modified", additions: 22, deletions: 3 }],
    reviewers: [],
    checks: [{ name: "ci", status: "completed", conclusion: "success", url: null }],
  },
  {
    githubPrNumber: 410,
    title: "Add loading skeleton to dashboard",
    url: "https://github.com/demo/acme-app/pull/410",
    authorLogin: "priya",
    mergedAt: daysAgo(45),
    baseRef: "main",
    additions: 35,
    deletions: 2,
    changedFiles: [
      { path: "src/components/DashboardSkeleton.tsx", status: "added", additions: 35, deletions: 0 },
    ],
    reviewers: [{ login: "sam", state: "approved", submittedAt: daysAgo(45) }],
    checks: [{ name: "ci", status: "completed", conclusion: "success", url: null }],
  },
  {
    githubPrNumber: 411,
    title: "Adjust embedding chunk size for long documents",
    url: "https://github.com/demo/acme-app/pull/411",
    authorLogin: "sam",
    mergedAt: daysAgo(50),
    baseRef: "main",
    additions: 18,
    deletions: 9,
    changedFiles: [
      { path: "src/embeddings/chunker.ts", status: "modified", additions: 18, deletions: 9 },
    ],
    reviewers: [{ login: "priya", state: "changes_requested", submittedAt: daysAgo(50) }],
    checks: [{ name: "ci", status: "completed", conclusion: "success", url: null }],
  },
  {
    githubPrNumber: 412,
    title: "Grant the research agent a new web-search tool",
    url: "https://github.com/demo/acme-app/pull/412",
    authorLogin: "priya",
    mergedAt: daysAgo(55),
    baseRef: "main",
    additions: 70,
    deletions: 0,
    changedFiles: [
      { path: "src/agents/research-agent.ts", status: "modified", additions: 70, deletions: 0 },
    ],
    reviewers: [{ login: "sam", state: "approved", submittedAt: daysAgo(55) }],
    checks: [{ name: "ci", status: "completed", conclusion: "success", url: null }],
  },
];
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/github/demo-fixture.ts
git commit -m "feat: add demo pull request fixture"
```

---

### Task 15: GitHub retention-allowlist mapper

**Files:**
- Create: `src/lib/github/map-to-store-input.ts`
- Test: `src/lib/github/map-to-store-input.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks besides plain object shapes.
- Produces: `mapGithubPullRequestToInput(raw: RawGithubPullRequestData): Omit<UpsertPullRequestInput, "repositoryId">` — consumed by Task 17's real GitHub import fetcher. This is the code that enforces §7's retention allowlist, so its test asserts the banned fields are structurally absent, not just unused.

- [ ] **Step 1: Write the failing test**

```ts filename="src/lib/github/map-to-store-input.test.ts"
import { describe, it, expect } from "vitest";
import { mapGithubPullRequestToInput } from "./map-to-store-input";

describe("mapGithubPullRequestToInput", () => {
  it("strips patch content, PR body, review comment bodies, and check output/logs", () => {
    const raw = {
      pr: {
        number: 99,
        title: "Update retrieval index",
        html_url: "https://github.com/acme/acme-app/pull/99",
        user: { login: "jane" },
        merged_at: "2026-07-01T00:00:00.000Z",
        base: { ref: "main" },
        additions: 10,
        deletions: 2,
        body: "SECRET_PR_BODY should never be persisted",
      },
      files: [
        {
          filename: "src/retrieval/index.ts",
          status: "modified" as const,
          additions: 10,
          deletions: 2,
          patch: "@@ -1,3 +1,3 @@\nSECRET_PATCH_CONTENT",
        },
      ],
      reviews: [
        {
          user: { login: "sam" },
          state: "APPROVED",
          submitted_at: "2026-07-01T01:00:00.000Z",
          body: "SECRET_REVIEW_COMMENT should never be persisted",
        },
      ],
      checks: [
        {
          name: "ci",
          status: "completed",
          conclusion: "success",
          html_url: "https://github.com/acme/acme-app/runs/1",
          output: { summary: "SECRET_CHECK_LOG", text: "SECRET_CHECK_LOG_BODY" },
        },
      ],
    };

    const result = mapGithubPullRequestToInput(raw);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("SECRET_PR_BODY");
    expect(serialized).not.toContain("SECRET_PATCH_CONTENT");
    expect(serialized).not.toContain("SECRET_REVIEW_COMMENT");
    expect(serialized).not.toContain("SECRET_CHECK_LOG");

    expect(result.title).toBe("Update retrieval index");
    expect(result.changedFiles).toEqual([
      { path: "src/retrieval/index.ts", status: "modified", additions: 10, deletions: 2 },
    ]);
    expect(result.reviewers).toEqual([
      { login: "sam", state: "approved", submittedAt: "2026-07-01T01:00:00.000Z" },
    ]);
    expect(result.checks).toEqual([
      { name: "ci", status: "completed", conclusion: "success", url: "https://github.com/acme/acme-app/runs/1" },
    ]);
  });

  it("drops reviews with no recognized state (e.g. DISMISSED, PENDING)", () => {
    const raw = {
      pr: {
        number: 1,
        title: "x",
        html_url: "https://github.com/acme/acme-app/pull/1",
        user: { login: "jane" },
        merged_at: "2026-07-01T00:00:00.000Z",
        base: { ref: "main" },
        additions: 1,
        deletions: 1,
        body: null,
      },
      files: [],
      reviews: [
        { user: { login: "sam" }, state: "DISMISSED", submitted_at: "2026-07-01T00:00:00.000Z" },
        { user: { login: "sam" }, state: "PENDING", submitted_at: null },
      ],
      checks: [],
    };
    const result = mapGithubPullRequestToInput(raw);
    expect(result.reviewers).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/github/map-to-store-input.test.ts`
Expected: FAIL — no such module.

- [ ] **Step 3: Implement**

```ts filename="src/lib/github/map-to-store-input.ts"
import type { UpsertPullRequestInput } from "../../db/store";
import type { ChangeStatus, ReviewState, CheckConclusion } from "../types";

export interface RawGithubPullRequestSummary {
  number: number;
  title: string;
  html_url: string;
  user: { login: string } | null;
  merged_at: string | null;
  base: { ref: string };
  additions: number;
  deletions: number;
  body: string | null; // intentionally unused below — never persisted
}

export interface RawGithubPullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string; // intentionally unused below — never persisted
}

export interface RawGithubPullRequestReview {
  user: { login: string } | null;
  state: string;
  submitted_at: string | null;
  body?: string; // intentionally unused below — never persisted
}

export interface RawGithubCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
  output?: { summary?: string | null; text?: string | null }; // intentionally unused below
}

export interface RawGithubPullRequestData {
  pr: RawGithubPullRequestSummary;
  files: RawGithubPullRequestFile[];
  reviews: RawGithubPullRequestReview[];
  checks: RawGithubCheckRun[];
}

function normalizeFileStatus(status: string): ChangeStatus {
  if (status === "added") return "added";
  if (status === "removed") return "removed";
  return "modified";
}

function normalizeReviewState(state: string): ReviewState | null {
  switch (state) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes_requested";
    case "COMMENTED":
      return "commented";
    default:
      return null; // DISMISSED, PENDING, etc. — not a durable review-state signal
  }
}

function normalizeCheckStatus(status: string): "queued" | "in_progress" | "completed" {
  if (status === "queued" || status === "in_progress" || status === "completed") return status;
  return "completed";
}

export function mapGithubPullRequestToInput(
  raw: RawGithubPullRequestData
): Omit<UpsertPullRequestInput, "repositoryId"> {
  return {
    githubPrNumber: raw.pr.number,
    title: raw.pr.title,
    url: raw.pr.html_url,
    authorLogin: raw.pr.user?.login ?? "unknown",
    mergedAt: raw.pr.merged_at ?? new Date().toISOString(),
    baseRef: raw.pr.base.ref,
    additions: raw.pr.additions,
    deletions: raw.pr.deletions,
    changedFiles: raw.files.map((f) => ({
      path: f.filename,
      status: normalizeFileStatus(f.status),
      additions: f.additions,
      deletions: f.deletions,
    })),
    reviewers: raw.reviews
      .map((r) => {
        const state = normalizeReviewState(r.state);
        if (!state || !r.user || !r.submitted_at) return null;
        return { login: r.user.login, state, submittedAt: r.submitted_at };
      })
      .filter((r): r is { login: string; state: ReviewState; submittedAt: string } => r !== null),
    checks: raw.checks.map((c) => ({
      name: c.name,
      status: normalizeCheckStatus(c.status),
      conclusion: (c.conclusion as CheckConclusion) ?? null,
      url: c.html_url,
    })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/github/map-to-store-input.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/map-to-store-input.ts src/lib/github/map-to-store-input.test.ts
git commit -m "feat: add GitHub raw-data mapper enforcing the retention allowlist"
```

---

### Task 16: Import orchestration (`runImport`)

**Files:**
- Create: `src/lib/import/run-import.ts`
- Test: `src/lib/import/run-import.test.ts`

**Interfaces:**
- Consumes: `DataStore` (Task 8), `classify()` (Task 13), `DEMO_PULL_REQUESTS` (Task 14).
- Produces: `type PullRequestSource = { kind: "demo" } | { kind: "github"; fetch: () => Promise<Array<Omit<UpsertPullRequestInput, "repositoryId">>> }` and `runImport(store: DataStore, params: { repositoryId: string; periodStart: string; periodEnd: string; source: PullRequestSource }): Promise<ImportRun>` — consumed by Task 17's live GitHub fetcher (as the `github` source) and Task 20's import-trigger page.

This is where spec test cases 9 and 10 ("re-import preserves human-reviewed assessments" / "evidence state is never auto-finalized") are proven end-to-end, on top of what Task 10 already proved at the store layer alone.

- [ ] **Step 1: Write the failing tests**

```ts filename="src/lib/import/run-import.test.ts"
import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../../db/in-memory-store";
import { runImport } from "./run-import";

async function setupRepo(store: InMemoryStore) {
  const org = await store.createOrganization("Acme AI");
  const repo = await store.createRepository({
    organizationId: org.id,
    owner: "acme",
    name: "acme-app",
    installationId: null,
    isDemo: true,
  });
  return repo;
}

describe("runImport", () => {
  it("imports demo PRs within the period and classifies each new one", async () => {
    const store = new InMemoryStore();
    const repo = await setupRepo(store);

    const run = await runImport(store, {
      repositoryId: repo.id,
      periodStart: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      periodEnd: new Date().toISOString(),
      source: { kind: "demo" },
    });

    expect(run.status).toBe("SUCCEEDED");
    expect(run.prCount).toBeGreaterThan(0);

    const withAssessments = await store.listPullRequestsWithAssessments(repo.id);
    expect(withAssessments.length).toBe(run.prCount);
    for (const { assessments } of withAssessments) {
      expect(assessments.length).toBeGreaterThanOrEqual(1);
      for (const a of assessments) {
        expect(a.reviewStatus).toBe("PENDING");
        expect(a.evidenceState).toBe("MISSING");
      }
    }
  });

  it("excludes PRs merged outside the requested period", async () => {
    const store = new InMemoryStore();
    const repo = await setupRepo(store);

    const run = await runImport(store, {
      repositoryId: repo.id,
      periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      periodEnd: new Date().toISOString(),
      source: { kind: "demo" },
    });

    expect(run.prCount).toBe(0);
  });

  it("re-importing preserves a human review and does not duplicate assessments", async () => {
    const store = new InMemoryStore();
    const repo = await setupRepo(store);
    const period = {
      periodStart: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      periodEnd: new Date().toISOString(),
    };

    await runImport(store, { repositoryId: repo.id, source: { kind: "demo" }, ...period });

    const [{ pullRequest, assessments: firstPassAssessments }] =
      await store.listPullRequestsWithAssessments(repo.id);
    const target = firstPassAssessments[0];
    await store.updateAssessment(target.id, {
      reviewStatus: "CONFIRMED",
      reviewerSummary: "Reviewed for the pilot pack.",
      evidenceState: "COMPLETE",
      verificationState: "PASSED",
    });

    await runImport(store, { repositoryId: repo.id, source: { kind: "demo" }, ...period });

    const assessmentsAfter = await store.listAssessments(pullRequest.id);
    expect(assessmentsAfter).toHaveLength(firstPassAssessments.length);
    const stillConfirmed = assessmentsAfter.find((a) => a.id === target.id)!;
    expect(stillConfirmed.reviewStatus).toBe("CONFIRMED");
    expect(stillConfirmed.evidenceState).toBe("COMPLETE");
  });

  it("marks the import run FAILED with a sanitized message when the source throws", async () => {
    const store = new InMemoryStore();
    const repo = await setupRepo(store);

    await expect(
      runImport(store, {
        repositoryId: repo.id,
        periodStart: new Date(0).toISOString(),
        periodEnd: new Date().toISOString(),
        source: {
          kind: "github",
          fetch: async () => {
            throw new Error("GitHub API request failed with status 502");
          },
        },
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/import/run-import.test.ts`
Expected: FAIL — no such module.

- [ ] **Step 3: Implement**

```ts filename="src/lib/import/run-import.ts"
import type { DataStore, UpsertPullRequestInput } from "../../db/store";
import type { ImportRun } from "../types";
import { classify } from "../classification/classify";
import { DEMO_PULL_REQUESTS } from "../github/demo-fixture";

export type PullRequestSourceInput = Omit<UpsertPullRequestInput, "repositoryId">;

export type PullRequestSource =
  | { kind: "demo" }
  | { kind: "github"; fetch: () => Promise<PullRequestSourceInput[]> };

export async function runImport(
  store: DataStore,
  params: {
    repositoryId: string;
    periodStart: string;
    periodEnd: string;
    source: PullRequestSource;
  }
): Promise<ImportRun> {
  const importRun = await store.createImportRun({
    repositoryId: params.repositoryId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });
  await store.updateImportRun(importRun.id, { status: "RUNNING" });

  try {
    const fetched: PullRequestSourceInput[] =
      params.source.kind === "demo" ? DEMO_PULL_REQUESTS : await params.source.fetch();

    const inPeriod = fetched.filter(
      (pr) => pr.mergedAt >= params.periodStart && pr.mergedAt <= params.periodEnd
    );

    for (const prInput of inPeriod) {
      const { pullRequest, isNew } = await store.upsertPullRequest({
        ...prInput,
        repositoryId: params.repositoryId,
      });

      if (!isNew) continue;

      const classifications = classify({
        title: pullRequest.title,
        changedFiles: pullRequest.changedFiles,
      });
      for (const result of classifications) {
        await store.createAssessment({
          pullRequestId: pullRequest.id,
          category: result.category,
          confidence: result.confidence,
          detectionReasons: result.detectionReasons,
        });
      }
    }

    return store.updateImportRun(importRun.id, { status: "SUCCEEDED", prCount: inPeriod.length });
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown import error";
    await store.updateImportRun(importRun.id, { status: "FAILED", errorMessage: message });
    throw error;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/import/run-import.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/run-import.ts src/lib/import/run-import.test.ts
git commit -m "feat: add import orchestration with classify-once-on-new-PR policy"
```

---

## Milestone M4 — GitHub integration (live)

### Task 17: GitHub App client and live PR fetcher

**Files:**
- Create: `src/lib/github/app-client.ts`
- Create: `src/lib/github/fetch-pull-requests.ts`

**Interfaces:**
- Consumes: `mapGithubPullRequestToInput` (Task 15), `PullRequestSourceInput` (Task 16).
- Produces: `getInstallationOctokit(installationId: string)`, `verifyInstallation(installationId: string): Promise<{ id: number; account: unknown }>`, `listInstallationRepositories(installationId: string): Promise<Array<{ id: number; name: string; owner: { login: string } }>>` (all consumed by Task 18's install-callback and Task 19's engagement-creation action), and `fetchPullRequestsForRepository(installationId: string, owner: string, repo: string): Promise<PullRequestSourceInput[]>` (consumed by Task 20 as `runImport`'s `github` source).

This is live-GitHub integration code — it is verified manually against a real installed App (Step 4 below) rather than mocked in Vitest; the logic it depends on (`mapGithubPullRequestToInput`) already has its own unit tests from Task 15.

- [ ] **Step 1: Implement the App client**

```ts filename="src/lib/github/app-client.ts"
import { App } from "octokit";

let _app: App | null = null;

function getApp(): App {
  if (!_app) {
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    if (!appId || !privateKey) {
      throw new Error("GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY are not configured");
    }
    _app = new App({ appId, privateKey });
  }
  return _app;
}

export async function getInstallationOctokit(installationId: string) {
  const app = getApp();
  return app.getInstallationOctokit(Number(installationId));
}

/**
 * Confirms installationId is real and belongs to this App, using the App's
 * own JWT auth — never trust an installation_id from a query string alone.
 */
export async function verifyInstallation(installationId: string) {
  const app = getApp();
  const { data } = await app.octokit.request("GET /app/installations/{installation_id}", {
    installation_id: Number(installationId),
  });
  return data;
}

export async function listInstallationRepositories(installationId: string) {
  const installationOctokit = await getInstallationOctokit(installationId);
  const { data } = await installationOctokit.request("GET /installation/repositories");
  return data.repositories;
}
```

- [ ] **Step 2: Implement the PR fetcher**

```ts filename="src/lib/github/fetch-pull-requests.ts"
import { getInstallationOctokit } from "./app-client";
import { mapGithubPullRequestToInput } from "./map-to-store-input";
import type { PullRequestSourceInput } from "../import/run-import";

export async function fetchPullRequestsForRepository(
  installationId: string,
  owner: string,
  repo: string
): Promise<PullRequestSourceInput[]> {
  const octokit = await getInstallationOctokit(installationId);

  const closedPrs = await octokit.paginate("GET /repos/{owner}/{repo}/pulls", {
    owner,
    repo,
    state: "closed",
    per_page: 100,
  });
  const mergedPrs = closedPrs.filter((pr) => pr.merged_at != null);

  const results: PullRequestSourceInput[] = [];

  for (const pr of mergedPrs) {
    const files = await octokit.paginate("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", {
      owner,
      repo,
      pull_number: pr.number,
      per_page: 100,
    });
    const reviews = await octokit.paginate(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
      { owner, repo, pull_number: pr.number, per_page: 100 }
    );
    const checkSha = pr.merge_commit_sha ?? pr.head.sha;
    const { data: checkRunsData } = await octokit.request(
      "GET /repos/{owner}/{repo}/commits/{ref}/check-runs",
      { owner, repo, ref: checkSha, per_page: 100 }
    );

    // Octokit's generated response types are a superset of our minimal
    // Raw* interfaces (Task 15); a structural cast is expected here.
    results.push(
      mapGithubPullRequestToInput({
        pr: pr as unknown as Parameters<typeof mapGithubPullRequestToInput>[0]["pr"],
        files: files as unknown as Parameters<typeof mapGithubPullRequestToInput>[0]["files"],
        reviews: reviews as unknown as Parameters<typeof mapGithubPullRequestToInput>[0]["reviews"],
        checks: checkRunsData.check_runs as unknown as Parameters<
          typeof mapGithubPullRequestToInput
        >[0]["checks"],
      })
    );
  }

  return results;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify against a real installed App**

With a GitHub App created (App ID/private key in `.env.local`, permissions `Metadata: Read`, `Pull requests: Read`, `Checks: Read`, `Commit statuses: Read` only) and installed on one test repository, write a one-off local script or REPL call to `fetchPullRequestsForRepository(installationId, owner, repo)` and confirm it returns merged PRs with no `patch`/`body`/comment fields anywhere in the output.
Expected: a non-empty array (assuming the test repo has merged PRs) matching the `PullRequestSourceInput` shape.

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/app-client.ts src/lib/github/fetch-pull-requests.ts
git commit -m "feat: add GitHub App installation auth and live PR fetcher"
```

---

### Task 18: Hardened installation callback

**Files:**
- Create: `src/app/api/github/install-callback/route.ts`

**Interfaces:**
- Consumes: `requireSession()` (Task 5), `verifyInstallation()` (Task 17).
- Produces: the `/api/github/install-callback` route. It hands off to `/engagements/new?installation_id=<verified>` — Task 19 does the actual repository listing/selection and `Repository` creation, re-verifying the installation itself rather than trusting this redirect's query string as anything more than a hint.

- [ ] **Step 1: Implement**

```ts filename="src/app/api/github/install-callback/route.ts"
import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth/require-session";
import { verifyInstallation } from "../../../../lib/github/app-client";

export async function GET(request: Request) {
  // Require a valid operator session before doing anything with this callback.
  await requireSession();

  const url = new URL(request.url);
  const installationIdParam = url.searchParams.get("installation_id");

  if (!installationIdParam) {
    return NextResponse.redirect(new URL("/engagements/new?error=missing_installation", request.url));
  }

  try {
    // installation_id from the query string is an unverified hint only.
    // Confirm it via the App's own server-side JWT auth before using it for
    // anything — this is the check that prevents a forged installation_id.
    await verifyInstallation(installationIdParam);
  } catch {
    return NextResponse.redirect(new URL("/engagements/new?error=invalid_installation", request.url));
  }

  // Repository owner/name are never read from this callback's query string.
  // /engagements/new re-verifies the installation and lists its accessible
  // repositories itself before letting the operator pick one.
  return NextResponse.redirect(
    new URL(`/engagements/new?installation_id=${encodeURIComponent(installationIdParam)}`, request.url)
  );
}
```

- [ ] **Step 2: Manually verify**

With the App installed on a test repo, click "Install" from `/engagements/new` (built in Task 19) and confirm the browser round-trips through `/api/github/install-callback` and lands back on `/engagements/new` with a verified `installation_id` in the URL. Then manually hit `/api/github/install-callback?installation_id=999999999` (a nonexistent ID) and confirm it redirects with `error=invalid_installation` rather than proceeding.
Expected: a valid installation round-trips cleanly; a bogus `installation_id` is rejected, not silently accepted.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/github/install-callback/route.ts
git commit -m "feat: add hardened GitHub installation callback"
```

---

## Milestone M5 — Review UI

### Task 19: Engagement list and new-engagement setup

**Files:**
- Modify: `src/app/page.tsx` (replace the default create-next-app homepage)
- Create: `src/app/engagements/new/actions.ts`
- Create: `src/app/engagements/new/page.tsx`

**Interfaces:**
- Consumes: `requireSession()` (Task 5), `getStore()` (Task 12), `verifyInstallation`/`listInstallationRepositories` (Task 17).
- Produces: `createDemoEngagement`, `createGithubEngagement` Server Actions — both redirect to `/engagements/[id]/import` (Task 20), where `[id]` is the created `Repository`'s id (there is no separate "Engagement" table — one `Organization` + its one active `Repository` **is** the engagement, per the spec's data model).

Verified manually (it's page/routing wiring, not pure logic): the underlying pieces (`verifyInstallation`, `DataStore`) already have their own tests.

- [ ] **Step 1: Replace the homepage with the engagement list**

```tsx filename="src/app/page.tsx"
import Link from "next/link";
import { requireSession } from "../lib/auth/require-session";
import { getStore } from "../db/get-store";

export default async function EngagementListPage() {
  await requireSession();
  const store = getStore();
  const organizations = await store.listOrganizations();
  const rows = await Promise.all(
    organizations.map(async (org) => ({
      org,
      repo: await store.getActiveRepository(org.id),
    }))
  );

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Engagements</h1>
        <Link href="/engagements/new" className="rounded bg-black px-3 py-2 text-white">
          New engagement
        </Link>
      </div>
      <ul className="divide-y divide-gray-200">
        {rows.map(({ org, repo }) => (
          <li key={org.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">{org.name}</p>
              <p className="text-sm text-gray-500">
                {repo
                  ? `${repo.owner}/${repo.name}${repo.isDemo ? " (demo)" : ""}`
                  : "No repository connected"}
              </p>
            </div>
            {repo && (
              <Link href={`/engagements/${repo.id}/review`} className="text-sm underline">
                Review
              </Link>
            )}
          </li>
        ))}
        {rows.length === 0 && <p className="py-6 text-sm text-gray-500">No engagements yet.</p>}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Implement the setup Server Actions**

```ts filename="src/app/engagements/new/actions.ts"
"use server";
import { redirect } from "next/navigation";
import { requireSession } from "../../../lib/auth/require-session";
import { getStore } from "../../../db/get-store";
import { verifyInstallation, listInstallationRepositories } from "../../../lib/github/app-client";

export async function createDemoEngagement(formData: FormData) {
  await requireSession();
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  if (!organizationName) throw new Error("Organization name is required");

  const store = getStore();
  const org = await store.createOrganization(organizationName);
  const repo = await store.createRepository({
    organizationId: org.id,
    owner: "demo",
    name: "acme-app",
    installationId: null,
    isDemo: true,
  });
  redirect(`/engagements/${repo.id}/import`);
}

export async function createGithubEngagement(formData: FormData) {
  await requireSession();
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  const installationId = String(formData.get("installationId") ?? "");
  const selectedRepoId = Number(formData.get("repositoryId"));

  if (!organizationName) throw new Error("Organization name is required");
  if (!installationId) throw new Error("Missing installation id");

  // Re-verify — never trust a value that only round-tripped through the browser,
  // even one this same flow already verified in the callback.
  await verifyInstallation(installationId);
  const accessibleRepos = await listInstallationRepositories(installationId);
  const selectedRepo = accessibleRepos.find((r) => r.id === selectedRepoId);
  if (!selectedRepo) {
    throw new Error("Selected repository is not accessible to this installation");
  }

  const store = getStore();
  const org = await store.createOrganization(organizationName);
  const repo = await store.createRepository({
    organizationId: org.id,
    owner: selectedRepo.owner.login,
    name: selectedRepo.name,
    installationId,
    isDemo: false,
  });
  redirect(`/engagements/${repo.id}/import`);
}
```

- [ ] **Step 3: Implement the setup page**

```tsx filename="src/app/engagements/new/page.tsx"
import { requireSession } from "../../../lib/auth/require-session";
import { verifyInstallation, listInstallationRepositories } from "../../../lib/github/app-client";
import { createDemoEngagement, createGithubEngagement } from "./actions";

export default async function NewEngagementPage({
  searchParams,
}: {
  searchParams: Promise<{ installation_id?: string; error?: string }>;
}) {
  await requireSession();
  const { installation_id: installationId, error } = await searchParams;

  if (installationId) {
    // Re-verify on render too — this page never trusts the query string alone.
    await verifyInstallation(installationId);
    const repos = await listInstallationRepositories(installationId);

    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="mb-4 text-xl font-semibold">Connect a repository</h1>
        <form action={createGithubEngagement} className="flex flex-col gap-3">
          <input type="hidden" name="installationId" value={installationId} />
          <label className="text-sm font-medium" htmlFor="organizationName">
            Customer / organization name
          </label>
          <input
            id="organizationName"
            name="organizationName"
            required
            className="rounded border border-gray-300 px-3 py-2"
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Repository</legend>
            {repos.map((repo) => (
              <label key={repo.id} className="flex items-center gap-2">
                <input type="radio" name="repositoryId" value={repo.id} required />
                {repo.owner.login}/{repo.name}
              </label>
            ))}
            {repos.length === 0 && (
              <p className="text-sm text-red-600">
                This installation has no accessible repositories.
              </p>
            )}
          </fieldset>
          <button
            type="submit"
            disabled={repos.length === 0}
            className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
          >
            Create engagement
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-xl font-semibold">New engagement</h1>
      {error && <p className="mb-4 text-sm text-red-600">GitHub connection failed: {error}</p>}

      <section className="mb-8">
        <h2 className="mb-2 font-medium">Option A — Demo data</h2>
        <form action={createDemoEngagement} className="flex flex-col gap-3">
          <input
            name="organizationName"
            placeholder="Customer / organization name"
            required
            className="rounded border border-gray-300 px-3 py-2"
          />
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Create demo engagement
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 font-medium">Option B — Connect GitHub</h2>
        <a
          href={`https://github.com/apps/${process.env.GITHUB_APP_SLUG}/installations/new`}
          className="inline-block rounded bg-black px-3 py-2 text-white"
        >
          Install GitHub App
        </a>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Verify manually**

Run: `pnpm dotenv -e .env.local -- pnpm dev`, log in, click "New engagement", create one via "Demo data", confirm it redirects to `/engagements/<id>/import` and the new engagement now shows on `/`.
Expected: demo engagement creation works end to end without any GitHub/Supabase credentials configured (using `InMemoryStore`).

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/engagements/new/actions.ts src/app/engagements/new/page.tsx
git commit -m "feat: add engagement list and new-engagement setup (demo + GitHub)"
```

---

### Task 20: Import trigger page

**Files:**
- Create: `src/app/engagements/[id]/import/actions.ts`
- Create: `src/app/engagements/[id]/import/page.tsx`

**Interfaces:**
- Consumes: `requireSession()` (Task 5), `getStore()` (Task 12), `runImport()` (Task 16), `fetchPullRequestsForRepository()` (Task 17).

- [ ] **Step 1: Implement the trigger Server Action**

```ts filename="src/app/engagements/[id]/import/actions.ts"
"use server";
import { redirect } from "next/navigation";
import { requireSession } from "../../../../lib/auth/require-session";
import { getStore } from "../../../../db/get-store";
import { runImport } from "../../../../lib/import/run-import";
import { fetchPullRequestsForRepository } from "../../../../lib/github/fetch-pull-requests";

export async function triggerImport(formData: FormData) {
  await requireSession();
  const repositoryId = String(formData.get("repositoryId"));
  const preset = String(formData.get("period"));

  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date = now;

  if (preset === "60") {
    periodStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  } else if (preset === "90") {
    periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  } else {
    periodStart = new Date(String(formData.get("customStart")));
    periodEnd = new Date(String(formData.get("customEnd")));
  }

  const store = getStore();
  const repo = await store.getRepository(repositoryId);
  if (!repo) throw new Error("Repository not found");

  await runImport(store, {
    repositoryId: repo.id,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    source: repo.isDemo
      ? { kind: "demo" }
      : {
          kind: "github",
          fetch: () =>
            fetchPullRequestsForRepository(repo.installationId!, repo.owner, repo.name),
        },
  });

  redirect(`/engagements/${repo.id}/review`);
}
```

- [ ] **Step 2: Implement the page**

```tsx filename="src/app/engagements/[id]/import/page.tsx"
import { requireSession } from "../../../../lib/auth/require-session";
import { getStore } from "../../../../db/get-store";
import { triggerImport } from "./actions";

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const repo = await getStore().getRepository(id);
  if (!repo) return <main className="p-6">Engagement not found.</main>;

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-xl font-semibold">
        Import — {repo.owner}/{repo.name}
        {repo.isDemo && " (demo)"}
      </h1>
      <form action={triggerImport} className="flex flex-col gap-3">
        <input type="hidden" name="repositoryId" value={repo.id} />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Period</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="period" value="60" defaultChecked /> Last 60 days
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="period" value="90" /> Last 90 days
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="period" value="custom" /> Custom
          </label>
          <div className="ml-6 flex gap-2">
            <input
              type="date"
              name="customStart"
              className="rounded border border-gray-300 px-2 py-1"
            />
            <input
              type="date"
              name="customEnd"
              className="rounded border border-gray-300 px-2 py-1"
            />
          </div>
        </fieldset>
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Run import
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Verify manually**

From a demo engagement created in Task 19, run the import with "Last 90 days" and confirm it redirects to `/engagements/<id>/review` with the demo fixture's PRs visible (built in Task 21).
Expected: import completes and redirects without error.

- [ ] **Step 4: Commit**

```bash
git add "src/app/engagements/[id]/import/actions.ts" "src/app/engagements/[id]/import/page.tsx"
git commit -m "feat: add import trigger page with 60/90/custom period selector"
```

---

### Task 21: Review page (list, filters, per-assessment review form)

**Files:**
- Create: `src/app/engagements/[id]/review/actions.ts`
- Create: `src/app/engagements/[id]/review/page.tsx`

**Interfaces:**
- Consumes: `requireSession()` (Task 5), `getStore()` (Task 12), domain enums (Task 7).
- Produces: `updateAssessmentAction` Server Action — this is the only place `evidence_state`/`verification_state`/`review_status` can change after import, and it always requires an explicit operator submission (never auto-set).

- [ ] **Step 1: Implement the review Server Action with runtime-validated enum inputs**

```ts filename="src/app/engagements/[id]/review/actions.ts"
"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "../../../../lib/auth/require-session";
import { getStore } from "../../../../db/get-store";
import type {
  AssessmentCategory,
  ReviewStatusValue,
  EvidenceStateValue,
  VerificationStateValue,
} from "../../../../lib/types";

const CATEGORIES: AssessmentCategory[] = [
  "PROMPT",
  "MODEL_CONFIGURATION",
  "RETRIEVAL_ACCESS",
  "TOOL_PERMISSION",
  "NONE",
  "NEEDS_HUMAN_REVIEW",
];
const REVIEW_STATUSES: ReviewStatusValue[] = ["PENDING", "CONFIRMED", "EXCLUDED"];
const EVIDENCE_STATES: EvidenceStateValue[] = ["COMPLETE", "MISSING", "STALE", "UNAVAILABLE"];
const VERIFICATION_STATES: VerificationStateValue[] = [
  "PASSED",
  "MISSING",
  "UNAVAILABLE",
  "NOT_APPLICABLE",
];

function assertOneOf<T extends string>(value: string, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) throw new Error(`Invalid value: ${value}`);
  return value as T;
}

export async function updateAssessmentAction(formData: FormData) {
  await requireSession();

  const assessmentId = String(formData.get("assessmentId"));
  const repositoryId = String(formData.get("repositoryId"));
  const reviewerSummaryRaw = String(formData.get("reviewerSummary") ?? "");

  const store = getStore();
  await store.updateAssessment(assessmentId, {
    category: assertOneOf(String(formData.get("category")), CATEGORIES),
    reviewStatus: assertOneOf(String(formData.get("reviewStatus")), REVIEW_STATUSES),
    reviewerSummary: reviewerSummaryRaw.trim() === "" ? null : reviewerSummaryRaw,
    evidenceState: assertOneOf(String(formData.get("evidenceState")), EVIDENCE_STATES),
    verificationState: assertOneOf(String(formData.get("verificationState")), VERIFICATION_STATES),
  });

  revalidatePath(`/engagements/${repositoryId}/review`);
}
```

- [ ] **Step 2: Implement the review page**

```tsx filename="src/app/engagements/[id]/review/page.tsx"
import Link from "next/link";
import { requireSession } from "../../../../lib/auth/require-session";
import { getStore } from "../../../../db/get-store";
import { updateAssessmentAction } from "./actions";
import type {
  AssessmentCategory,
  ReviewStatusValue,
  EvidenceStateValue,
  VerificationStateValue,
} from "../../../../lib/types";

const CATEGORY_OPTIONS: AssessmentCategory[] = [
  "PROMPT",
  "MODEL_CONFIGURATION",
  "RETRIEVAL_ACCESS",
  "TOOL_PERMISSION",
  "NONE",
  "NEEDS_HUMAN_REVIEW",
];
const REVIEW_STATUS_OPTIONS: ReviewStatusValue[] = ["PENDING", "CONFIRMED", "EXCLUDED"];
const EVIDENCE_STATE_OPTIONS: EvidenceStateValue[] = ["COMPLETE", "MISSING", "STALE", "UNAVAILABLE"];
const VERIFICATION_STATE_OPTIONS: VerificationStateValue[] = [
  "PASSED",
  "MISSING",
  "UNAVAILABLE",
  "NOT_APPLICABLE",
];

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const { filter } = await searchParams;
  const showAll = filter === "all";

  const store = getStore();
  const repo = await store.getRepository(id);
  if (!repo) return <main className="p-6">Engagement not found.</main>;

  const withAssessments = await store.listPullRequestsWithAssessments(repo.id);
  const rows = withAssessments.flatMap(({ pullRequest, assessments }) =>
    assessments
      .filter((a) => showAll || a.category !== "NONE")
      .map((assessment) => ({ pullRequest, assessment }))
  );

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Review — {repo.owner}/{repo.name}
        </h1>
        <div className="flex gap-3 text-sm">
          <Link
            href={`/engagements/${repo.id}/review`}
            className={showAll ? "underline" : "font-semibold"}
          >
            Flagged
          </Link>
          <Link
            href={`/engagements/${repo.id}/review?filter=all`}
            className={showAll ? "font-semibold" : "underline"}
          >
            All PRs
          </Link>
        </div>
      </div>

      <div className="mb-4">
        <Link
          href={`/engagements/${repo.id}/packs/new`}
          className="inline-block rounded bg-black px-3 py-2 text-sm text-white"
        >
          Generate evidence pack
        </Link>
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map(({ pullRequest, assessment }) => {
          const approvals = pullRequest.reviewers.filter((r) => r.state === "approved").length;
          const checkConclusions = pullRequest.checks.map((c) => c.conclusion ?? "pending");
          const observation = `GitHub shows ${approvals} approval(s) and check conclusion(s): ${
            checkConclusions.length > 0 ? checkConclusions.join(", ") : "none recorded"
          }.`;

          return (
            <li key={assessment.id} className="rounded border border-gray-200">
              <details>
                <summary className="flex cursor-pointer items-center justify-between gap-3 p-3">
                  <span className="flex-1">
                    <a
                      href={pullRequest.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline"
                    >
                      #{pullRequest.githubPrNumber} {pullRequest.title}
                    </a>
                  </span>
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs">{assessment.category}</span>
                  <span className="text-xs text-gray-500">{assessment.confidence}</span>
                  <span className="text-xs text-gray-500">{assessment.reviewStatus}</span>
                </summary>

                <div className="border-t border-gray-200 p-3">
                  <p className="mb-2 text-xs text-gray-500">
                    Detected because: {assessment.detectionReasons.join("; ") || "no signals recorded"}
                  </p>
                  <p className="mb-4 text-xs text-gray-500">
                    {observation} (an observation only — it does not set evidence state)
                  </p>

                  <form action={updateAssessmentAction} className="grid grid-cols-2 gap-3">
                    <input type="hidden" name="assessmentId" value={assessment.id} />
                    <input type="hidden" name="repositoryId" value={repo.id} />

                    <label className="flex flex-col text-sm">
                      Category
                      <select
                        name="category"
                        defaultValue={assessment.category}
                        className="rounded border border-gray-300 px-2 py-1"
                      >
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col text-sm">
                      Review status
                      <select
                        name="reviewStatus"
                        defaultValue={assessment.reviewStatus}
                        className="rounded border border-gray-300 px-2 py-1"
                      >
                        {REVIEW_STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col text-sm">
                      Evidence state
                      <select
                        name="evidenceState"
                        defaultValue={assessment.evidenceState}
                        className="rounded border border-gray-300 px-2 py-1"
                      >
                        {EVIDENCE_STATE_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col text-sm">
                      Verification state
                      <select
                        name="verificationState"
                        defaultValue={assessment.verificationState}
                        className="rounded border border-gray-300 px-2 py-1"
                      >
                        {VERIFICATION_STATE_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="col-span-2 flex flex-col text-sm">
                      What changed (reviewer summary)
                      <textarea
                        name="reviewerSummary"
                        defaultValue={assessment.reviewerSummary ?? ""}
                        rows={3}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                    </label>

                    <button
                      type="submit"
                      className="col-span-2 rounded bg-black px-3 py-2 text-sm text-white"
                    >
                      Save
                    </button>
                  </form>
                </div>
              </details>
            </li>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-gray-500">No PRs match this filter.</p>}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Verify manually**

From a demo engagement with an import already run, open `/engagements/<id>/review`, confirm the default view shows only non-`NONE` assessments, switch to "All PRs" and confirm `NONE` rows appear too, expand one, change its review status to `CONFIRMED` and evidence state to `COMPLETE`, save, and confirm the row's summary badges update.
Expected: saving updates only the fields submitted; a fresh import afterward (Task 20) does not reset this reviewed assessment (per Task 16's guarantee).

- [ ] **Step 4: Commit**

```bash
git add "src/app/engagements/[id]/review/actions.ts" "src/app/engagements/[id]/review/page.tsx"
git commit -m "feat: add review page with flagged/all filter and per-assessment review form"
```

---

## Milestone M6 — Evidence pack & reports

### Task 22: Evidence-pack snapshot builder (report inclusion rule)

**Files:**
- Create: `src/lib/evidence-pack/build-pack.ts`
- Test: `src/lib/evidence-pack/build-pack.test.ts`

**Interfaces:**
- Consumes: `PullRequestWithAssessments` (Task 8), `EvidencePackSnapshot`/`EvidencePackSnapshotRow` (Task 7).
- Produces: `buildEvidencePackSnapshot(params): EvidencePackSnapshot` — consumed by Task 24's pack-generation trigger page.

Interpretation note carried forward from the spec: `totalPrsScanned` is a PR-level count; `nonAiCount`, `pendingReviewCount`, and `confirmedIncludedCount` are assessment-level counts (a PR with two AI-relevant surfaces can contribute to more than one of those three). This is more precise than a PR-level partition once a PR can have multiple categories, and it matches what `ai_change_assessments` actually stores.

- [ ] **Step 1: Write the failing tests**

```ts filename="src/lib/evidence-pack/build-pack.test.ts"
import { describe, it, expect } from "vitest";
import { buildEvidencePackSnapshot } from "./build-pack";
import type { PullRequestWithAssessments } from "../../db/store";
import type { Assessment, PullRequestRecord } from "../types";

function makePr(overrides: Partial<PullRequestRecord> = {}): PullRequestRecord {
  return {
    id: "pr-1",
    repositoryId: "repo-1",
    githubPrNumber: 1,
    title: "Test PR",
    url: "https://github.com/acme/app/pull/1",
    authorLogin: "jane",
    mergedAt: "2026-07-01T00:00:00.000Z",
    baseRef: "main",
    additions: 1,
    deletions: 1,
    changedFiles: [],
    reviewers: [],
    checks: [],
    importedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    id: "assessment-1",
    pullRequestId: "pr-1",
    category: "PROMPT",
    confidence: "HIGH",
    detectionReasons: ["x"],
    reviewStatus: "CONFIRMED",
    reviewerSummary: null,
    evidenceState: "COMPLETE",
    verificationState: "PASSED",
    reviewedAt: "2026-07-02T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

const baseParams = {
  organizationName: "Acme AI",
  repositoryOwner: "acme",
  repositoryName: "acme-app",
  periodStart: "2026-05-01T00:00:00.000Z",
  periodEnd: "2026-07-30T00:00:00.000Z",
  generatedAt: "2026-07-31T00:00:00.000Z",
};

describe("buildEvidencePackSnapshot", () => {
  it("includes only CONFIRMED assessments as rows", () => {
    const data: PullRequestWithAssessments[] = [
      {
        pullRequest: makePr({ id: "pr-1", githubPrNumber: 1 }),
        assessments: [makeAssessment({ id: "a1", pullRequestId: "pr-1", reviewStatus: "CONFIRMED" })],
      },
      {
        pullRequest: makePr({ id: "pr-2", githubPrNumber: 2 }),
        assessments: [makeAssessment({ id: "a2", pullRequestId: "pr-2", reviewStatus: "PENDING" })],
      },
      {
        pullRequest: makePr({ id: "pr-3", githubPrNumber: 3 }),
        assessments: [makeAssessment({ id: "a3", pullRequestId: "pr-3", reviewStatus: "EXCLUDED" })],
      },
      {
        pullRequest: makePr({ id: "pr-4", githubPrNumber: 4 }),
        assessments: [makeAssessment({ id: "a4", pullRequestId: "pr-4", category: "NONE" })],
      },
    ];

    const snapshot = buildEvidencePackSnapshot({ ...baseParams, pullRequestsWithAssessments: data });

    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0].assessment.id).toBe("a1");
    expect(snapshot.totals).toEqual({
      totalPrsScanned: 4,
      nonAiCount: 1,
      pendingReviewCount: 1,
      confirmedIncludedCount: 1,
    });
  });

  it("includes one row per CONFIRMED assessment when a PR has multiple categories", () => {
    const data: PullRequestWithAssessments[] = [
      {
        pullRequest: makePr({ id: "pr-1" }),
        assessments: [
          makeAssessment({ id: "a1", category: "PROMPT", reviewStatus: "CONFIRMED" }),
          makeAssessment({ id: "a2", category: "RETRIEVAL_ACCESS", reviewStatus: "PENDING" }),
        ],
      },
    ];

    const snapshot = buildEvidencePackSnapshot({ ...baseParams, pullRequestsWithAssessments: data });

    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0].assessment.category).toBe("PROMPT");
    expect(snapshot.totals.pendingReviewCount).toBe(1);
  });

  it("carries the exact mandatory disclaimer text", () => {
    const snapshot = buildEvidencePackSnapshot({ ...baseParams, pullRequestsWithAssessments: [] });
    expect(snapshot.disclaimer).toBe(
      "This pack documents identified AI-relevant code changes and associated GitHub review and verification evidence. It is not a statement that the AI system is safe, compliant, or approved by an auditor."
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/evidence-pack/build-pack.test.ts`
Expected: FAIL — no such module.

- [ ] **Step 3: Implement**

```ts filename="src/lib/evidence-pack/build-pack.ts"
import type { PullRequestWithAssessments } from "../../db/store";
import type { EvidencePackSnapshot, EvidencePackSnapshotRow } from "../types";

export const MANDATORY_DISCLAIMER =
  "This pack documents identified AI-relevant code changes and associated GitHub review and verification evidence. It is not a statement that the AI system is safe, compliant, or approved by an auditor.";

export function buildEvidencePackSnapshot(params: {
  organizationName: string;
  repositoryOwner: string;
  repositoryName: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  pullRequestsWithAssessments: PullRequestWithAssessments[];
}): EvidencePackSnapshot {
  let nonAiCount = 0;
  let pendingReviewCount = 0;
  const rows: EvidencePackSnapshotRow[] = [];

  for (const { pullRequest, assessments } of params.pullRequestsWithAssessments) {
    for (const assessment of assessments) {
      if (assessment.category === "NONE") {
        nonAiCount += 1;
        continue;
      }
      if (assessment.reviewStatus === "EXCLUDED") {
        continue;
      }
      if (assessment.reviewStatus === "PENDING") {
        pendingReviewCount += 1;
        continue;
      }
      rows.push({ pullRequest, assessment });
    }
  }

  return {
    organizationName: params.organizationName,
    repositoryOwner: params.repositoryOwner,
    repositoryName: params.repositoryName,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    generatedAt: params.generatedAt,
    totals: {
      totalPrsScanned: params.pullRequestsWithAssessments.length,
      nonAiCount,
      pendingReviewCount,
      confirmedIncludedCount: rows.length,
    },
    rows,
    disclaimer: MANDATORY_DISCLAIMER,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/evidence-pack/build-pack.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/lib/evidence-pack/build-pack.ts src/lib/evidence-pack/build-pack.test.ts
git commit -m "feat: add evidence-pack snapshot builder with CONFIRMED-only inclusion rule"
```

---

### Task 23: CSV and Markdown renderers

**Files:**
- Create: `src/lib/evidence-pack/render.ts`
- Test: `src/lib/evidence-pack/render.test.ts`

**Interfaces:**
- Consumes: `EvidencePackSnapshot` (Task 7).
- Produces: `renderMarkdown(snapshot): string`, `renderCsv(snapshot): string` — consumed by Task 24's report pages.

This is where the spec's "facts vs. conclusions" rule (§10) becomes testable: every GitHub-derived line is prefixed `"GitHub review state: ..."` / `"GitHub check conclusion: ..."`, every operator-entered line is prefixed `"Operator-recorded ...:"`, and no prohibited compliance phrase ever appears in the output.

- [ ] **Step 1: Write the failing tests**

```ts filename="src/lib/evidence-pack/render.test.ts"
import { describe, it, expect } from "vitest";
import { renderMarkdown, renderCsv } from "./render";
import { MANDATORY_DISCLAIMER } from "./build-pack";
import type { EvidencePackSnapshot } from "../types";

const PROHIBITED_PHRASES = [
  "audit-ready",
  "compliant",
  "soc 2 compliant",
  "ai safe",
  "approved by an auditor",
  "will pass audit",
  "certified",
  "guaranteed",
];

const snapshot: EvidencePackSnapshot = {
  organizationName: "Acme AI",
  repositoryOwner: "acme",
  repositoryName: "acme-app",
  periodStart: "2026-05-01T00:00:00.000Z",
  periodEnd: "2026-07-30T00:00:00.000Z",
  generatedAt: "2026-07-31T00:00:00.000Z",
  totals: { totalPrsScanned: 5, nonAiCount: 2, pendingReviewCount: 1, confirmedIncludedCount: 1 },
  rows: [
    {
      pullRequest: {
        id: "pr-1",
        repositoryId: "repo-1",
        githubPrNumber: 42,
        title: "Update onboarding prompt",
        url: "https://github.com/acme/acme-app/pull/42",
        authorLogin: "jane",
        mergedAt: "2026-07-01T00:00:00.000Z",
        baseRef: "main",
        additions: 10,
        deletions: 2,
        changedFiles: [],
        reviewers: [{ login: "sam", state: "approved", submittedAt: "2026-07-01T00:00:00.000Z" }],
        checks: [{ name: "ci", status: "completed", conclusion: "success", url: null }],
        importedAt: "2026-07-02T00:00:00.000Z",
      },
      assessment: {
        id: "assessment-1",
        pullRequestId: "pr-1",
        category: "PROMPT",
        confidence: "HIGH",
        detectionReasons: ["path matched prompts/"],
        reviewStatus: "CONFIRMED",
        reviewerSummary: "Reworded the onboarding welcome message.",
        evidenceState: "COMPLETE",
        verificationState: "PASSED",
        reviewedAt: "2026-07-03T00:00:00.000Z",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-03T00:00:00.000Z",
      },
    },
  ],
  disclaimer: MANDATORY_DISCLAIMER,
};

describe("renderMarkdown", () => {
  const output = renderMarkdown(snapshot);

  it("includes the mandatory disclaimer verbatim", () => {
    expect(output).toContain(MANDATORY_DISCLAIMER);
  });

  it("labels the GitHub fact and the operator judgment separately", () => {
    expect(output).toContain("GitHub review state: Approved by sam on 2026-07-01");
    expect(output).toContain("GitHub check conclusion: Success (ci)");
    expect(output).toContain("Operator-recorded evidence state: Complete");
    expect(output).toContain("Operator-recorded verification state: Passed");
  });

  it("never emits a prohibited compliance conclusion", () => {
    const lower = output.toLowerCase();
    for (const phrase of PROHIBITED_PHRASES) {
      expect(lower).not.toContain(phrase);
    }
  });

  it("says there are no confirmed rows when the snapshot has none", () => {
    const empty = renderMarkdown({ ...snapshot, rows: [] });
    expect(empty).toContain("No confirmed AI-relevant changes");
  });
});

describe("renderCsv", () => {
  const output = renderCsv(snapshot);

  it("includes a header row and one data row per confirmed assessment", () => {
    const lines = output.split("\n");
    expect(lines[0]).toContain("PR Number");
    expect(lines[1]).toContain("42");
    expect(lines[1]).toContain("PROMPT");
  });

  it("escapes a comma in the title correctly", () => {
    const withComma: EvidencePackSnapshot = {
      ...snapshot,
      rows: [
        {
          ...snapshot.rows[0],
          pullRequest: { ...snapshot.rows[0].pullRequest, title: "Update prompt, retrieval, and tools" },
        },
      ],
    };
    const csv = renderCsv(withComma);
    expect(csv).toContain('"Update prompt, retrieval, and tools"');
  });

  it("includes the mandatory disclaimer as a trailing line", () => {
    expect(output).toContain(MANDATORY_DISCLAIMER);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/evidence-pack/render.test.ts`
Expected: FAIL — no such module.

- [ ] **Step 3: Implement**

```ts filename="src/lib/evidence-pack/render.ts"
import type { EvidencePackSnapshot, EvidencePackSnapshotRow } from "../types";

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replace(/_/g, " ");
}

function githubReviewFacts(row: EvidencePackSnapshotRow): string[] {
  return row.pullRequest.reviewers.map(
    (r) => `GitHub review state: ${titleCase(r.state)} by ${r.login} on ${r.submittedAt.slice(0, 10)}`
  );
}

function githubCheckFacts(row: EvidencePackSnapshotRow): string[] {
  return row.pullRequest.checks.map(
    (c) => `GitHub check conclusion: ${c.conclusion ? titleCase(c.conclusion) : "Pending"} (${c.name})`
  );
}

function operatorFacts(row: EvidencePackSnapshotRow): string[] {
  return [
    `Operator-recorded evidence state: ${titleCase(row.assessment.evidenceState)}`,
    `Operator-recorded verification state: ${titleCase(row.assessment.verificationState)}`,
  ];
}

export function renderMarkdown(snapshot: EvidencePackSnapshot): string {
  const lines: string[] = [
    "# AI Change Evidence Pack",
    "",
    `**Organization:** ${snapshot.organizationName}`,
    `**Repository:** ${snapshot.repositoryOwner}/${snapshot.repositoryName}`,
    `**Period:** ${snapshot.periodStart.slice(0, 10)} to ${snapshot.periodEnd.slice(0, 10)}`,
    `**Generated:** ${snapshot.generatedAt}`,
    "",
    "## Scan totals",
    `- Total merged PRs scanned: ${snapshot.totals.totalPrsScanned}`,
    `- Classified non-AI: ${snapshot.totals.nonAiCount}`,
    `- Pending human review: ${snapshot.totals.pendingReviewCount}`,
    `- Confirmed AI-relevant (included below): ${snapshot.totals.confirmedIncludedCount}`,
    "",
    "## Confirmed AI-relevant changes",
    "",
  ];

  if (snapshot.rows.length === 0) {
    lines.push("_No confirmed AI-relevant changes in this period._");
  }

  for (const row of snapshot.rows) {
    lines.push(`### #${row.pullRequest.githubPrNumber} — ${row.pullRequest.title}`);
    lines.push(`- Category: ${row.assessment.category}`);
    lines.push(`- ${row.pullRequest.url}`);
    lines.push(`- Merged: ${row.pullRequest.mergedAt.slice(0, 10)} by ${row.pullRequest.authorLogin}`);
    lines.push(
      "- Evidence of GitHub review and verification associated with this identified AI-relevant change."
    );
    for (const fact of githubReviewFacts(row)) lines.push(`- ${fact}`);
    for (const fact of githubCheckFacts(row)) lines.push(`- ${fact}`);
    for (const fact of operatorFacts(row)) lines.push(`- ${fact}`);
    if (row.assessment.reviewerSummary) {
      lines.push(`- Operator summary: ${row.assessment.reviewerSummary}`);
    }
    lines.push("");
  }

  lines.push("---", "", snapshot.disclaimer);

  return lines.join("\n");
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function renderCsv(snapshot: EvidencePackSnapshot): string {
  const header = [
    "PR Number",
    "Title",
    "URL",
    "Category",
    "Merged Date",
    "Author",
    "GitHub Review Facts",
    "GitHub Check Facts",
    "Operator-recorded Evidence State",
    "Operator-recorded Verification State",
    "Operator Summary",
  ];
  const lines = [header.join(",")];

  for (const row of snapshot.rows) {
    const cells = [
      String(row.pullRequest.githubPrNumber),
      row.pullRequest.title,
      row.pullRequest.url,
      row.assessment.category,
      row.pullRequest.mergedAt.slice(0, 10),
      row.pullRequest.authorLogin,
      githubReviewFacts(row).join("; "),
      githubCheckFacts(row).join("; "),
      `Operator-recorded evidence state: ${titleCase(row.assessment.evidenceState)}`,
      `Operator-recorded verification state: ${titleCase(row.assessment.verificationState)}`,
      row.assessment.reviewerSummary ?? "",
    ];
    lines.push(cells.map(csvEscape).join(","));
  }

  lines.push("", csvEscape(snapshot.disclaimer));

  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/evidence-pack/render.test.ts`
Expected: PASS (8/8)

- [ ] **Step 5: Commit**

```bash
git add src/lib/evidence-pack/render.ts src/lib/evidence-pack/render.test.ts
git commit -m "feat: add CSV/Markdown renderers with source-labeled facts vs. operator judgments"
```

---

### Task 24: Pack generation, report page, and print view

**Files:**
- Modify: `src/lib/evidence-pack/render.ts` (export `titleCase` so the JSX view doesn't duplicate it)
- Create: `src/app/engagements/[id]/packs/new/actions.ts`
- Create: `src/app/engagements/[id]/packs/new/page.tsx`
- Create: `src/components/EvidencePackReport.tsx`
- Create: `src/components/PrintButton.tsx`
- Create: `src/app/reports/[id]/page.tsx`
- Create: `src/app/reports/[id]/print/page.tsx`
- Create: `src/app/reports/[id]/csv/route.ts`
- Create: `src/app/reports/[id]/markdown/route.ts`

**Interfaces:**
- Consumes: `buildEvidencePackSnapshot` (Task 22), `renderCsv`/`renderMarkdown` (Task 23), `getStore()` (Task 12), `requireSession()` (Task 5).

Note on scope: the spec's route list (§12) names `/reports/[id]` and `/reports/[id]/print`; the `csv`/`markdown` GET routes added here are download sub-resources of that same report id, not new pages or new customer-facing surface — they exist because "CSV, Markdown, and print-friendly HTML exports" is an explicit Keep-list requirement and a downloadable file needs a URL. Both routes sit behind `requireSession()` like everything else. Flagging this here since it's a small, deliberate addition beyond the literal route list.

- [ ] **Step 1: Export `titleCase` from the renderer**

```ts filename="src/lib/evidence-pack/render.ts"
// change:
// function titleCase(value: string): string {
// to:
export function titleCase(value: string): string {
```

- [ ] **Step 2: Implement the pack-generation Server Action**

```ts filename="src/app/engagements/[id]/packs/new/actions.ts"
"use server";
import { redirect } from "next/navigation";
import { requireSession } from "../../../../../lib/auth/require-session";
import { getStore } from "../../../../../db/get-store";
import { buildEvidencePackSnapshot } from "../../../../../lib/evidence-pack/build-pack";

export async function generatePack(formData: FormData) {
  await requireSession();
  const repositoryId = String(formData.get("repositoryId"));
  const preset = String(formData.get("period"));

  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date = now;

  if (preset === "60") {
    periodStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  } else if (preset === "90") {
    periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  } else {
    periodStart = new Date(String(formData.get("customStart")));
    periodEnd = new Date(String(formData.get("customEnd")));
  }

  const store = getStore();
  const repo = await store.getRepository(repositoryId);
  if (!repo) throw new Error("Repository not found");
  const org = await store.getOrganization(repo.organizationId);
  if (!org) throw new Error("Organization not found");

  const withAssessments = await store.listPullRequestsWithAssessments(repo.id, {
    start: periodStart.toISOString(),
    end: periodEnd.toISOString(),
  });

  const snapshot = buildEvidencePackSnapshot({
    organizationName: org.name,
    repositoryOwner: repo.owner,
    repositoryName: repo.name,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    generatedAt: now.toISOString(),
    pullRequestsWithAssessments: withAssessments,
  });

  const pack = await store.createEvidencePack({
    repositoryId: repo.id,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    prCount: snapshot.totals.totalPrsScanned,
    assessedCount: snapshot.totals.confirmedIncludedCount,
    snapshot,
  });

  redirect(`/reports/${pack.id}`);
}
```

- [ ] **Step 3: Implement the pack-generation page**

```tsx filename="src/app/engagements/[id]/packs/new/page.tsx"
import { requireSession } from "../../../../../lib/auth/require-session";
import { getStore } from "../../../../../db/get-store";
import { generatePack } from "./actions";

export default async function NewPackPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const repo = await getStore().getRepository(id);
  if (!repo) return <main className="p-6">Engagement not found.</main>;

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-xl font-semibold">
        Generate evidence pack — {repo.owner}/{repo.name}
      </h1>
      <form action={generatePack} className="flex flex-col gap-3">
        <input type="hidden" name="repositoryId" value={repo.id} />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Period</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="period" value="60" defaultChecked /> Last 60 days
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="period" value="90" /> Last 90 days
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="period" value="custom" /> Custom
          </label>
          <div className="ml-6 flex gap-2">
            <input
              type="date"
              name="customStart"
              className="rounded border border-gray-300 px-2 py-1"
            />
            <input
              type="date"
              name="customEnd"
              className="rounded border border-gray-300 px-2 py-1"
            />
          </div>
        </fieldset>
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Generate pack
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Implement the shared report component**

```tsx filename="src/components/EvidencePackReport.tsx"
import type { EvidencePackSnapshot } from "../lib/types";
import { titleCase } from "../lib/evidence-pack/render";

export function EvidencePackReport({ snapshot }: { snapshot: EvidencePackSnapshot }) {
  return (
    <article className="prose max-w-none">
      <h1>AI Change Evidence Pack</h1>
      <p>
        <strong>Organization:</strong> {snapshot.organizationName}
      </p>
      <p>
        <strong>Repository:</strong> {snapshot.repositoryOwner}/{snapshot.repositoryName}
      </p>
      <p>
        <strong>Period:</strong> {snapshot.periodStart.slice(0, 10)} to{" "}
        {snapshot.periodEnd.slice(0, 10)}
      </p>
      <p>
        <strong>Generated:</strong> {snapshot.generatedAt}
      </p>

      <h2>Scan totals</h2>
      <ul>
        <li>Total merged PRs scanned: {snapshot.totals.totalPrsScanned}</li>
        <li>Classified non-AI: {snapshot.totals.nonAiCount}</li>
        <li>Pending human review: {snapshot.totals.pendingReviewCount}</li>
        <li>Confirmed AI-relevant (included below): {snapshot.totals.confirmedIncludedCount}</li>
      </ul>

      <h2>Confirmed AI-relevant changes</h2>
      {snapshot.rows.length === 0 && (
        <p>
          <em>No confirmed AI-relevant changes in this period.</em>
        </p>
      )}
      {snapshot.rows.map((row) => (
        <section key={row.assessment.id}>
          <h3>
            #{row.pullRequest.githubPrNumber} — {row.pullRequest.title}
          </h3>
          <p>Category: {row.assessment.category}</p>
          <p>
            <a href={row.pullRequest.url}>{row.pullRequest.url}</a>
          </p>
          <p>
            Merged: {row.pullRequest.mergedAt.slice(0, 10)} by {row.pullRequest.authorLogin}
          </p>
          <p>
            Evidence of GitHub review and verification associated with this identified AI-relevant
            change.
          </p>
          <ul>
            {row.pullRequest.reviewers.map((r, i) => (
              <li key={i}>
                GitHub review state: {titleCase(r.state)} by {r.login} on{" "}
                {r.submittedAt.slice(0, 10)}
              </li>
            ))}
            {row.pullRequest.checks.map((c, i) => (
              <li key={i}>
                GitHub check conclusion: {c.conclusion ? titleCase(c.conclusion) : "Pending"} (
                {c.name})
              </li>
            ))}
            <li>Operator-recorded evidence state: {titleCase(row.assessment.evidenceState)}</li>
            <li>
              Operator-recorded verification state: {titleCase(row.assessment.verificationState)}
            </li>
          </ul>
          {row.assessment.reviewerSummary && <p>Operator summary: {row.assessment.reviewerSummary}</p>}
        </section>
      ))}

      <hr />
      <p>
        <strong>{snapshot.disclaimer}</strong>
      </p>
    </article>
  );
}
```

- [ ] **Step 5: Implement the print button (the only client component in the app)**

```tsx filename="src/components/PrintButton.tsx"
"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden rounded bg-black px-3 py-2 text-white"
    >
      Print / Save as PDF
    </button>
  );
}
```

- [ ] **Step 6: Implement the report page**

```tsx filename="src/app/reports/[id]/page.tsx"
import Link from "next/link";
import { requireSession } from "../../../lib/auth/require-session";
import { getStore } from "../../../db/get-store";
import { EvidencePackReport } from "../../../components/EvidencePackReport";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const pack = await getStore().getEvidencePack(id);
  if (!pack) return <main className="p-6">Evidence pack not found.</main>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex gap-4 text-sm">
        <Link href={`/reports/${pack.id}/print`} className="underline">
          Print / Save as PDF
        </Link>
        <Link href={`/reports/${pack.id}/csv`} className="underline">
          Download CSV
        </Link>
        <Link href={`/reports/${pack.id}/markdown`} className="underline">
          Download Markdown
        </Link>
      </div>
      <EvidencePackReport snapshot={pack.snapshot} />
    </main>
  );
}
```

- [ ] **Step 7: Implement the print page**

```tsx filename="src/app/reports/[id]/print/page.tsx"
import { requireSession } from "../../../../lib/auth/require-session";
import { getStore } from "../../../../db/get-store";
import { EvidencePackReport } from "../../../../components/EvidencePackReport";
import { PrintButton } from "../../../../components/PrintButton";

export default async function ReportPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const pack = await getStore().getEvidencePack(id);
  if (!pack) return <main className="p-6">Evidence pack not found.</main>;

  return (
    <main className="mx-auto max-w-3xl p-6 print:max-w-none print:p-0">
      <div className="mb-4 print:hidden">
        <PrintButton />
      </div>
      <EvidencePackReport snapshot={pack.snapshot} />
    </main>
  );
}
```

- [ ] **Step 8: Implement the CSV and Markdown download routes**

```ts filename="src/app/reports/[id]/csv/route.ts"
import { requireSession } from "../../../../lib/auth/require-session";
import { getStore } from "../../../../db/get-store";
import { renderCsv } from "../../../../lib/evidence-pack/render";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const pack = await getStore().getEvidencePack(id);
  if (!pack) return new Response("Not found", { status: 404 });

  return new Response(renderCsv(pack.snapshot), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="evidence-pack-${pack.id}.csv"`,
    },
  });
}
```

```ts filename="src/app/reports/[id]/markdown/route.ts"
import { requireSession } from "../../../../lib/auth/require-session";
import { getStore } from "../../../../db/get-store";
import { renderMarkdown } from "../../../../lib/evidence-pack/render";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const pack = await getStore().getEvidencePack(id);
  if (!pack) return new Response("Not found", { status: 404 });

  return new Response(renderMarkdown(pack.snapshot), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="evidence-pack-${pack.id}.md"`,
    },
  });
}
```

- [ ] **Step 9: Verify manually end to end**

From a demo engagement that's been imported and had at least one assessment confirmed (Task 21), go to `/engagements/<id>/packs/new`, generate a pack, confirm it redirects to `/reports/<packId>` showing only the confirmed assessment plus the scan totals and disclaimer, then check `/reports/<packId>/print` renders cleanly and `/reports/<packId>/csv` / `/markdown` download with correct content types.
Expected: the report never shows a `PENDING`, `EXCLUDED`, or `NONE` row as a pack entry; the disclaimer text matches the spec exactly; GitHub facts and operator facts are visibly source-labeled.

- [ ] **Step 10: Commit**

```bash
git add src/lib/evidence-pack/render.ts \
  "src/app/engagements/[id]/packs/new/actions.ts" "src/app/engagements/[id]/packs/new/page.tsx" \
  src/components/EvidencePackReport.tsx src/components/PrintButton.tsx \
  "src/app/reports/[id]/page.tsx" "src/app/reports/[id]/print/page.tsx" \
  "src/app/reports/[id]/csv/route.ts" "src/app/reports/[id]/markdown/route.ts"
git commit -m "feat: add evidence pack generation, HTML/print report views, and CSV/Markdown downloads"
```

---

### Task 25: Playwright end-to-end test

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/constants.ts`
- Create: `e2e/evidence-pack-flow.spec.ts`
- Modify: `package.json` (add `test:e2e` script)

**Interfaces:**
- Consumes: `hashPassword` (Task 2), the full page/route stack from Tasks 5, 19, 20, 21, 24.

This is the spec's required E2E scenario (§11): demo workspace → import → review an ambiguous PR → generate an evidence pack → verify the report row and disclaimer, plus verifying the untouched `NONE`/`PENDING` PRs from the fixture do not leak into the pack.

- [ ] **Step 1: Add the E2E password constant**

```ts filename="e2e/constants.ts"
export const E2E_OPERATOR_PASSWORD = "e2e-test-password";
```

- [ ] **Step 2: Implement `playwright.config.ts`**

```ts filename="playwright.config.ts"
import { defineConfig } from "@playwright/test";
import { hashPassword } from "./src/lib/auth/password";
import { E2E_OPERATOR_PASSWORD } from "./e2e/constants";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !process.env.CI,
    env: {
      OPERATOR_PASSWORD_HASH: hashPassword(E2E_OPERATOR_PASSWORD),
      OPERATOR_SESSION_SECRET: "e2e-test-session-secret-not-for-production",
      // DATABASE_URL intentionally unset -> InMemoryStore, fresh per server start
    },
  },
});
```

- [ ] **Step 3: Write the E2E test**

```ts filename="e2e/evidence-pack-flow.spec.ts"
import { test, expect } from "@playwright/test";
import { E2E_OPERATOR_PASSWORD } from "./constants";

test("demo -> import -> review an ambiguous PR -> generate pack -> report is correct", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Operator password").fill(E2E_OPERATOR_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("link", { name: "New engagement" }).click();
  await page.getByPlaceholder("Customer / organization name").fill("E2E Test Org");
  await page.getByRole("button", { name: "Create demo engagement" }).click();
  await expect(page).toHaveURL(/\/engagements\/.+\/import/);

  await page.getByLabel("Last 90 days").check();
  await page.getByRole("button", { name: "Run import" }).click();
  await expect(page).toHaveURL(/\/engagements\/.+\/review/);

  const engagementId = page.url().match(/engagements\/([^/]+)\//)![1];

  // The demo fixture's "Update schema" PR is deliberately ambiguous
  // (classify() has no confident category match for it).
  await page.getByRole("link", { name: "All PRs" }).click();
  const ambiguousRow = page.locator("li", { has: page.getByText("NEEDS_HUMAN_REVIEW") }).first();
  await ambiguousRow.locator("summary").click();
  await ambiguousRow.getByLabel("Category").selectOption("RETRIEVAL_ACCESS");
  await ambiguousRow.getByLabel("Review status").selectOption("CONFIRMED");
  await ambiguousRow.getByLabel("Evidence state").selectOption("COMPLETE");
  await ambiguousRow.getByLabel("Verification state").selectOption("PASSED");
  await ambiguousRow
    .getByLabel("What changed (reviewer summary)")
    .fill("Confirmed during E2E test.");
  await ambiguousRow.getByRole("button", { name: "Save" }).click();

  await page.goto(`/engagements/${engagementId}/packs/new`);
  await page.getByLabel("Last 90 days").check();
  await page.getByRole("button", { name: "Generate pack" }).click();
  await expect(page).toHaveURL(/\/reports\/.+/);

  await expect(
    page.getByText(
      "This pack documents identified AI-relevant code changes and associated GitHub review and verification evidence. It is not a statement that the AI system is safe, compliant, or approved by an auditor."
    )
  ).toBeVisible();
  await expect(page.getByText("Confirmed during E2E test.")).toBeVisible();
  await expect(page.getByText("Operator-recorded evidence state: Complete")).toBeVisible();

  // The demo fixture has unreviewed PRs left over — they must show up in the
  // totals, never as pack rows (the inclusion rule from Task 22).
  await expect(page.getByText(/Pending human review: [1-9]/)).toBeVisible();
});
```

- [ ] **Step 4: Add the script and install browsers (one-time)**

Add under `"scripts"` in `package.json`: `"test:e2e": "playwright test"`.

Run: `npx playwright install --with-deps chromium`
Expected: downloads the Chromium build Playwright drives (one-time per machine/CI image).

- [ ] **Step 5: Run the E2E test**

Run: `pnpm dotenv -e .env.local -- pnpm test:e2e`
Expected: PASS. If a locator doesn't resolve, run `pnpm exec playwright test --headed --debug` and adjust the affected page's markup/labels rather than loosening the assertions.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e/constants.ts e2e/evidence-pack-flow.spec.ts package.json
git commit -m "test: add E2E coverage for demo import -> review -> evidence pack flow"
```

---

## Post-plan checklist

- [ ] `pnpm test` (all Vitest suites) passes.
- [ ] `pnpm test:e2e` passes.
- [ ] `pnpm tsc --noEmit` passes.
- [ ] `pnpm lint` passes (existing `eslint.config.mjs` from the scaffold).
- [ ] Manually walk the full demo flow once more end-to-end in the browser (login → new engagement → import → review → generate pack → print view).
- [ ] Provision the real GitHub App (manual, in GitHub Developer Settings) and Supabase project, set all env vars on Render, run `drizzle-kit push` against Supabase, and do one live-repository import to confirm Task 17/18 against real GitHub data before the first pilot engagement.
