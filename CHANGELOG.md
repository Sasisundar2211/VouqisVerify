# Changelog

All notable changes to Vouqis Verify are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- `## Behavioral Impact` section in the Review Package (markdown, JSON, and terminal output) — states plainly what evidence exists for an AI-related change and what doesn't, e.g. "AI-related files changed, but no dedicated behavioral evaluation is configured." Never invents a behavioral claim the evidence doesn't support.
- `package-version` input on the GitHub Action — pin a specific `vouqis-verify` PyPI release instead of always installing latest.

### Fixed
- `vouqis doctor` no longer crashes with an unhandled traceback when the `git` executable itself is missing (as opposed to just not being inside a git repo) — reports a clean diagnostic instead.
- `vouqis verify`'s PR comment delivery now catches only the exceptions `post_pr_comment` can actually raise (`OSError`, `RuntimeError`) instead of a bare `except Exception`.
- The GitHub PR comment request now has a finite timeout instead of being able to hang indefinitely.
- `vouqis verify --json` no longer risks corrupting the JSON payload on long field values — the terminal renderer no longer soft-wraps the JSON output.

### Changed
- `doctor` diagnostics (config, git, CI env vars) extracted from the Typer command into `core/diagnostics.py::run_doctor()`, mirroring the existing `core/pipeline.py` pattern — testable independent of the CLI.

## [0.1.2]

### Fixed
- `vouqis verify` now rejects an invalid `vouqis.yml` (malformed YAML or out-of-range field values) with a clear error instead of silently falling back to defaults
- A failed `git diff` (e.g. a shallow checkout without `fetch-depth: 0`) is now distinguished from "no AI files changed" — it always downgrades to `MERGE WITH WARNING` and is never reported as `SAFE TO MERGE`
- `vouqis verify --json` no longer interleaves progress output with the JSON payload on stdout

## [0.1.1] — 2026-08-03

Initial release.

### Added
- `vouqis init` — generates `vouqis.yml`
- `vouqis verify` — runs eval, detects AI file changes, posts PR comment
- `vouqis doctor` — validates config and GitHub CI environment
- Git diff–based AI file change detection via `ai_paths`
- Evaluation runner supporting any shell command (pytest, promptfoo, braintrust, custom)
- Three-tier verdict: `SAFE TO MERGE` / `MERGE WITH WARNING` / `BLOCK MERGE`
- `## What Changed` section in PR comment — categorises AI file changes by path
- File-kind classification (Prompt / Agent / RAG / Tool / Evaluation / Model) shown in PR comments and JSON output
- Decision-focused feedback question: "Did this report change your merge decision?"
- `project_name` config field — shown in PR comment header
- Markdown PR comment with verdict, confidence, and feedback links
- GitHub Action (`action.yml`)
- Dataclass config schema with `eval_command`, `baseline`, `ai_paths`, `timeout_seconds`, `feedback_url`, `project_name`
