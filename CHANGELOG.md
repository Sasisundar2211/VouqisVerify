# Changelog

All notable changes to Vouqis Verify are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [0.1.2]

### Added
- `vouqis doctor` command — validates config and GitHub CI environment
- `## What Changed` section in PR comment — categorises AI file changes by path
- Three-tier verdict: `SAFE TO MERGE` / `MERGE WITH WARNING` / `BLOCK MERGE`
- `project_name` config field — shown in PR comment header
- Decision-focused feedback question: "Did this report change your merge decision?"
- File-kind classification (Prompt / Agent / RAG / Tool / Evaluation / Model) shown in PR comments and JSON output

### Fixed
- `vouqis verify` now rejects an invalid `vouqis.yml` (malformed YAML or out-of-range field values) with a clear error instead of silently falling back to defaults
- A failed `git diff` (e.g. a shallow checkout without `fetch-depth: 0`) is now distinguished from "no AI files changed" — it always downgrades to `MERGE WITH WARNING` and is never reported as `SAFE TO MERGE`
- `vouqis verify --json` no longer interleaves progress output with the JSON payload on stdout

## [0.1.0] — 2026-07-01

### Added
- `vouqis init` — generates `vouqis.yml`
- `vouqis verify` — runs eval, detects AI file changes, posts PR comment
- Git diff–based AI file change detection via `ai_paths`
- Evaluation runner supporting any shell command (pytest, promptfoo, braintrust, custom)
- Markdown PR comment with verdict, confidence, and feedback links
- GitHub Action (`action.yml`)
- Pydantic config schema with `eval_command`, `baseline`, `ai_paths`, `timeout_seconds`
