# Contributing to Vouqis Verify

## Setup

```bash
cd packages/verify
uv sync --all-extras
```

## Required checks

```bash
uv run ruff format --check .
uv run ruff check .
uv run pytest -q
```

Run `uv run ruff format .` to apply formatting. The full repository policy is
in [`docs/codebase-standard.md`](../../docs/codebase-standard.md).

## Project layout

```
vouqis_verify/
├── cli.py          # Typer CLI entry point: init, verify, doctor
├── config/
│   └── schema.py   # dataclass config model + YAML loader
├── core/
│   ├── classify.py    # Keyword-based AI-change kind classification
│   ├── diagnostics.py # `doctor` checks: config, git, CI env vars
│   ├── diff.py        # Git diff → changed AI files
│   ├── pipeline.py     # run_verification(): the verify command's core logic
│   └── runner.py      # Subprocess eval command runner
├── github/
│   └── pr.py       # GitHub REST API: post PR comment
└── report/
    └── render.py   # Markdown + terminal report builder
tests/
├── test_cli.py
├── test_classify.py
├── test_config.py
├── test_diagnostics.py
├── test_diff.py
├── test_doctor.py
├── test_pipeline.py
├── test_pr.py
├── test_render.py
└── test_runner.py
```

## Adding a feature

- Touch the minimum number of files
- Add a test in `tests/` that fails without your change
- Run `pytest` — all tests must pass

## Releasing

1. Bump the version in `pyproject.toml` and `vouqis_verify/__init__.py` (they
   must match).
2. Merge to `main`.
3. Tag the release commit with a `v`-prefixed version matching step 1 and
   push the tag, e.g. `git tag v0.1.2 && git push origin v0.1.2`.

Pushing a `v*` tag triggers [`.github/workflows/release.yml`](../../.github/workflows/release.yml),
which builds the package and publishes it to PyPI via
[trusted publishing](https://docs.pypi.org/trusted-publishers/) — no API
token required. See that workflow for the required one-time PyPI publisher
configuration.
