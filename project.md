# Vouqis Verify — Product Scope

## Product

Vouqis Verify is CI tooling that runs a repository's existing AI evaluation suite when configured AI files change and puts the result in pull-request review.

## User

The first user is an engineer shipping prompts, agents, RAG pipelines, model configuration, or AI-generated code through GitHub pull requests.

## Core flow

1. Read `.vouqis-verify.json` from the repository.
2. Use `git diff` between the configured base and head refs.
3. Filter changed files against configured AI paths.
4. Skip cleanly when no relevant file changed.
5. Run the configured evaluation command without a shell.
6. Write a bounded, review-ready Markdown report.
7. In GitHub Actions, create or update one pull-request comment and fail the job when the evaluation fails.

## Product surfaces

- **Python CLI:** local and CI execution, packaged as `vouqis-verify`.
- **Composite GitHub Action:** installs the CLI, runs it against PR refs, comments the report, and enforces the result.
- **Next.js dashboard:** reviews historical merged PRs, AI-change classifications, GitHub checks/statuses, and reviewer evidence; exports Excel and CSV.

The dashboard intentionally reads GitHub-native check history instead of introducing a second run database. A Vouqis workflow therefore appears alongside the repository's other checks.

## Configuration contract

```json
{
  "paths": ["prompts", "src/ai", "evals"],
  "command": ["python", "-m", "pytest", "evals"]
}
```

- `paths` is a non-empty list of repository-relative directories, files, or glob patterns.
- `command` is a non-empty argument array. Shell strings are rejected.
- The repository owns the evaluation logic and dependencies; Vouqis only decides when to run it and reports the result.

## Security boundaries

- Treat repository configuration and evaluation code as executable code.
- Never execute pull-request code through `pull_request_target` with privileged secrets.
- Give the Action only `contents: read` and `pull-requests: write` when comments are enabled.
- Escape and bound evaluator output before placing it in a GitHub comment.
- Keep GitHub App credentials server-side in the dashboard.

## Current non-goals

- A proprietary evaluation framework or model-provider SDK.
- Hosted storage for raw prompts, model outputs, or source diffs.
- Automatic prompt-quality judgments without a user-supplied evaluator.
- Multi-CI adapters beyond the CLI and GitHub Actions.
- Compliance or AI-safety certification claims.

Add hosted run ingestion only when real users need history beyond GitHub checks. Add more CI providers only after demand exists.

## Release gate

Before release or push, run the Python tests, lint, TypeScript checks, Vitest suite, Playwright flow, and production build. Publish Python distributions through PyPI Trusted Publishing from a GitHub release.
