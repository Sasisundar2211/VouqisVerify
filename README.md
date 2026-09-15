# Vouqis Verify

Most AI demos work once. Vouqis Verify checks whether they still work after the next change.

Vouqis Verify is CI tooling for AI-generated code and AI pipelines. It detects changes on configured AI paths, runs the repository's existing evaluation command, writes a review-ready Markdown report, and posts or updates that report on the pull request.

The repository contains three connected surfaces:

- A dependency-free Python CLI for local and CI verification.
- A composite GitHub Action for pull-request reporting and result enforcement.
- A typed Next.js dashboard for reviewing merged AI-related PRs and their GitHub check/review evidence.

## Quick start

Create `.vouqis-verify.json` in the repository you want to verify:

```json
{
  "paths": ["prompts", "src/ai", "evals"],
  "command": ["python", "-m", "pytest", "evals"]
}
```

The command is an argument array, not a shell string. Vouqis runs whatever evaluation suite your project already trusts.

Install and run the CLI:

```sh
python -m pip install vouqis-verify
vouqis-verify --base main --head HEAD
```

Until the first PyPI release is published, install directly from GitHub:

```sh
python -m pip install git+https://github.com/Sasisundar2211/VouqisVerify.git
```

The default report is `vouqis-verify-report.md`. The exit code is `0` when no configured paths changed or the evaluation passed, the evaluator's non-zero code when it failed, and `2` for configuration or Git errors.

## GitHub Action

```yaml
name: Vouqis Verify

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      # Install your evaluator's dependencies before running Vouqis.
      - uses: Sasisundar2211/VouqisVerify@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Use a version tag instead of `main` once the first release is available. The Action uses the runner's current Python environment and updates one Vouqis comment instead of adding a new comment on every commit. Make the workflow a required check if you want failed evaluations to block merges. Evaluation output is included in the report; never print secrets from your evaluator.

## Dashboard

The dashboard connects through a read-only GitHub App, retrieves merged pull requests for a date range, classifies AI-related changes from titles and file paths, and collects check runs, commit statuses, and reviews. Vouqis Action runs appear in that GitHub-native evidence. Reports export to Excel and CSV.

Create `.env.local` from `.env.example`, then run:

```sh
pnpm install
pnpm dev
```

## Development checks

```sh
python -m unittest discover -s tests
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright test
pnpm build
```

Vouqis Verify reports whether the configured evaluation ran and passed. It does not certify that an AI system is safe, compliant, or correct.

Licensed under Apache-2.0. Report bugs through [GitHub issues](https://github.com/Sasisundar2211/VouqisVerify/issues).
