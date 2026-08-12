# Vouqis Verify

Vouqis Verify is a CLI and GitHub Action that generates a deterministic, evidence-backed merge recommendation for pull requests that touch AI-related code.

## Why Vouqis Verify

AI-related changes — prompts, model configuration, RAG pipelines, tool definitions, agent logic, evaluation code — can pass every traditional code check (compiles, lints, unit tests are green) while quietly changing system behavior. Standard code review has no signal for this: a one-line prompt edit looks identical to a comment fix in a diff.

Vouqis Verify closes that gap without inventing a new evaluation framework. It detects when a pull request touches AI-related paths, runs the evaluation command you already have, and turns the result into a structured, reviewable recommendation — so "did anyone actually check this?" has a documented answer before merge.

This is an early-stage MVP (see [product scope](docs/product-scope.md)). It augments human code review; it does not replace reviewers or evaluation frameworks, and it does not use AI to make its decisions.

## How It Works

```
AI-related change (prompt, agent, RAG, tool, eval, model config)
        ↓
git diff against baseline → which AI paths changed?
        ↓
your eval_command runs (pytest, promptfoo, braintrust, a shell script — anything that exits 0/non-zero)
        ↓
verdict computed from exit code + changed paths
        ↓
SAFE TO MERGE / MERGE WITH WARNING / BLOCK MERGE, with reasons, posted to the PR
```

No AI is used to produce the verdict. The rules are fixed and documented in [Verification Model](#verification-model) below.

## Quick Start

### Requirements

- Python 3.11 or 3.12
- Git

### Install

```bash
pip install vouqis-verify
```

Or, for an isolated CLI install:

```bash
pipx install vouqis-verify
```

> On macOS, `pip3 install` / `python3 -m pip install` may fail with a PEP 668 "externally-managed-environment" error. Use `pipx`, or `python3 -m venv` first.

### Verify Installation

```bash
vouqis --version
# vouqis-verify 0.1.2
```

### Run Your First Verification

From inside any Git repository:

```bash
vouqis init            # creates vouqis.yml
vouqis verify --no-comment
```

`vouqis init` writes a default `vouqis.yml` — edit `eval_command` to the command that runs your evaluation suite, and `ai_paths` to the directories that hold your AI-related code. `--no-comment` skips posting a PR comment, which requires `GITHUB_TOKEN`/`PR_NUMBER`/`GITHUB_REPOSITORY` (set automatically inside the GitHub Action).

### Understand the Result

`vouqis verify` exits `0` when the evaluation command passed (regardless of verdict), `1` when it failed, and `2` when `vouqis.yml` is invalid. The verdict itself is one of:

| Verdict | Confidence | When |
|---|---|---|
| ✅ SAFE TO MERGE | High | Eval passed, no AI-related files changed |
| ⚠️ MERGE WITH WARNING | Medium | Eval passed, AI-related files changed — **or** the diff against baseline could not be determined |
| ❌ BLOCK MERGE | High | Eval failed |

An undeterminable diff (for example, a shallow CI checkout without `fetch-depth: 0`) is treated as unknown, not safe — it always downgrades to `MERGE WITH WARNING` and is never reported as `SAFE TO MERGE`.

## Example

Given a config:

```yaml
project_name: Fixture App
eval_command: python -m pytest tests/ -q
baseline: main
ai_paths:
  - prompts/
```

...and a pull request that changes `prompts/system.txt`, running `vouqis verify --no-comment` produces:

```
Vouqis Verify ── comparing against main
  eval: python -m pytest tests/ -q
  AI files changed: 1

  Running: python -m pytest tests/ -q

  ⚠️ MERGE WITH WARNING  ·  Medium confidence  ·  557ms

  Why:
    • Evaluation command completed successfully.
    • AI behavior files changed — human review recommended.
    • Existing tests cannot determine behavioral impact.
```

`vouqis verify --no-comment --json` prints the same result as structured JSON on stdout, for scripting:

```json
{
  "verdict": "MERGE WITH WARNING",
  "confidence": "Medium",
  "why": [
    "Evaluation command completed successfully.",
    "AI behavior files changed — human review recommended.",
    "Existing tests cannot determine behavioral impact."
  ],
  "changed_files": ["prompts/system.txt"],
  "kinds": { "prompts/system.txt": "Prompt" },
  "diff_failed": false,
  "project_name": "Fixture App",
  "eval": { "passed": true, "exit_code": 0, "duration_ms": 557, "command": "python -m pytest tests/ -q" }
}
```

## GitHub Actions

```yaml
# .github/workflows/vouqis-verify.yml
name: AI Change Verification

on:
  pull_request:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write   # required to post the PR comment

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0     # required for git diff against baseline

      - uses: Sasisundar2211/VouqisVerify/packages/verify@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Full reference, including inputs and local-testing commands: [docs/github-action.md](docs/github-action.md).

## Configuration

Vouqis Verify reads a single `vouqis.yml` in the repository root.

| Field | Required | Default | Description |
|---|---|---|---|
| `eval_command` | No | `pytest` | Shell command to run your evaluation suite. Exit `0` = pass. |
| `baseline` | No | `main` | Branch to diff against when detecting AI-related file changes. |
| `ai_paths` | No | `prompts/`, `src/agents/`, `evals/`, `models/`, `rag/`, `tools/` | Paths whose changes affect the verdict. The eval command always runs regardless. |
| `timeout_seconds` | No | `300` | Kill the eval command if it runs longer than this. |
| `project_name` | No | — | Display name shown in the PR comment header. |
| `feedback_url` | No | `https://vouqis.tech/verify-feedback` | Base URL for the 👍/👎 feedback links appended to PR comments. |

An invalid `vouqis.yml` (malformed YAML, or a field with an invalid value) causes `vouqis verify` to exit `2` with an error — it is never silently replaced with defaults.

Full reference: [docs/configuration.md](docs/configuration.md).

## Verification Model

**What Vouqis Verify checks today:**
- Whether any changed file falls under a configured `ai_paths` entry (plain path-prefix matching against `git diff`)
- Whether your evaluation command exited `0`
- Nothing else — there is no score parsing, no AI-generated explanation, and no evaluation framework bundled. Vouqis Verify runs the command you already have and reports its exit code.

**What it explicitly does not do:** run or replace your evals, parse evaluation scores, store historical baselines, or use an LLM to produce the verdict. See [docs/architecture.md](docs/architecture.md) for the full decision engine and [docs/roadmap.md](docs/roadmap.md) for what's under consideration for later versions — none of it is implemented yet.

## Development

```bash
cd packages/verify
uv sync --all-extras
uv run ruff format --check .
uv run ruff check .
uv run pytest -q
uv build --wheel
```

See [packages/verify/CONTRIBUTING.md](packages/verify/CONTRIBUTING.md) for the full workflow, including the release process. Repository-wide engineering standards are in [docs/codebase-standard.md](docs/codebase-standard.md).

## Testing

```bash
cd packages/verify
uv run pytest -q
```

## Project Structure

```
packages/verify/
├── vouqis_verify/
│   ├── cli.py      # Typer CLI: init, verify, doctor
│   ├── config/     # vouqis.yml schema and loader
│   ├── core/       # diff detection, eval runner, change classification
│   ├── github/     # GitHub PR comment API
│   └── report/     # verdict logic and report rendering
├── tests/
└── action.yml      # composite GitHub Action definition
docs/                # architecture, configuration, GitHub Action, roadmap
.github/workflows/   # CI and release automation
```

## Contributing

1. Create a branch: `feature/<name>`, `fix/<name>`, or `chore/<name>`.
2. Make a focused change and add tests for it.
3. Run the checks in [Development](#development).
4. Open a pull request against `main` using the PR template.

See [CONTRIBUTING.md](CONTRIBUTING.md) for commit conventions and branch protection expectations.

## License

[MIT](LICENSE)
