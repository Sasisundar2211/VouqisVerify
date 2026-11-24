# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-24

First release of the Python tool. Not yet published to PyPI.

### Added

- `vouqis run`, `compare`, `validate`, `init`, and `checks` commands with exit codes 0 (passed), 1 (failed), 2 (usage error).
- YAML and JSON suites with strict validation of every key and check parameter.
- 26 checks across answers, retrieval, grounding (heuristic), agent tool use, and execution.
- Baseline comparison with status, metric, drift, latency, and coverage findings, configurable through `compare.fail_on`.
- `repeat` and `min_pass_rate` for nondeterministic workflows. Per-invocation timeouts.
- Text, JSON, Markdown, and JUnit reports. Automatic GitHub job summary.
- Composite GitHub Action (`action.yml`), CI workflow, and a tag-triggered PyPI release workflow using trusted publishing.
- Offline reference RAG pipeline and tool-using agent in `examples/`, each with knobs that reproduce real regressions.
- `vouqis init --template {rag,agent}` writes a starter suite and target. The target raises `NotImplementedError` until connected, so a scaffold never passes on canned output.
- `vouqis run --workers N` (`-j N`) runs cases concurrently. Results keep suite order.
- Supports Python 3.10 to 3.14. Python 3.9 is not supported: it reached end of life in October 2025 and GitHub's hosted runners no longer provide it.

### Changed

- The repository now hosts the Python tool. The earlier Next.js "AI Change Evidence Pack" web app moved to `legacy/evidence-pack-web/` and is no longer maintained. Root `vercel.json` disables its Vercel Git deployments.

### Fixed

- Legacy web app: the OAuth connect route built `redirect_uri` from the raw `NEXT_PUBLIC_APP_URL` while the callback used the request-aware value, so GitHub rejected logins on public hosts. `typecheck` now generates Next.js route types first.

## Release process

1. Update `__version__` in `src/vouqis_verify/__init__.py` and move entries from Unreleased into a new version section.
2. Merge to `main` with CI green.
3. Tag `v<version>` and push the tag. `.github/workflows/release.yml` checks the tag matches the version, builds, runs `twine check`, and publishes through PyPI trusted publishing.
4. Before the first release, register the trusted publisher on pypi.org for this repository, workflow `release.yml`, environment `pypi`.
