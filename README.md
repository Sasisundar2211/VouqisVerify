# Vouqis Verify (VouqisVerify)

Vouqis Verify generates AI Change Evidence Packs from merged GitHub pull requests. Engineering teams can identify changes to prompts, model configuration, retrieval and access, and tool permissions, then export GitHub checks, commit statuses, and reviewer evidence to Excel and CSV.

This is the [VouqisVerify application repository](https://github.com/Sasisundar2211/VouqisVerify), maintained by [Sasi Sundar](https://github.com/Sasisundar2211).

## What does Vouqis Verify do?

- Connects to repositories through a GitHub App.
- Retrieves merged pull requests for a selected date range.
- Classifies AI-related changes using titles and changed file paths.
- Collects check runs, commit statuses, and pull request reviews.
- Exports an Excel evidence workbook and a raw CSV file.

## What is in the evidence pack?

| Excel sheet | Contents |
| --- | --- |
| Evidence Summary | Repository, date range, category totals, and verification totals |
| PR Evidence | Classifications, reviewer evidence, check summaries, and required actions |
| Verification Detail | Individual check runs, commit statuses, and review records |

Review approvals and CI checks are separate evidence sources. `NO_CHECKS_FOUND` is distinct from `CHECKS_PASSED`: missing checks do not establish successful verification.

The evidence pack does not certify that an AI system is safe, compliant, approved, or audit-ready. Classification uses rules; reviewers should inspect the underlying changes and evidence.

## Run locally

The application uses Next.js App Router, React, TypeScript, Octokit, and ExcelJS. Use the pnpm version pinned in `package.json`.

Create `.env.local` using `.env.example` as a starting point. Configure `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG`, `SESSION_SECRET`, and `NEXT_PUBLIC_APP_URL`.

Use the GitHub App PEM private key and a separate randomly generated session secret. Keep credentials out of Git and public issues.

For local development, set the App callback URL to `http://localhost:3000/api/github/callback` and the setup URL to `http://localhost:3000/api/github/setup`. Install the App on the repositories you intend to inspect, with read permissions for metadata, pull requests, checks, and commit statuses.

```sh
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000), connect GitHub, select a repository and date range, and generate an evidence pack. Use a separate disposable repository for synthetic test pull requests.

## Development checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Questions and feedback

Report bugs and request features through [VouqisVerify issues](https://github.com/Sasisundar2211/VouqisVerify/issues). Include reproduction steps and remove credentials or private repository data before submitting.
