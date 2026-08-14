# Vouqis Verify

Verify every AI change before it reaches production.

Vouqis Verify runs automatically on every pull request that touches your AI code. It executes your existing evaluation suite, generates a deployment review, and comments on the PR so your team can make an informed merge decision.

```
## Vouqis Verify

## What Changed

| | |
|---|---|
| `prompts/` | ✓ 1 file changed |
| `src/agents/` | — no change |
| Evaluation | ✅ PASS |
| Duration | 4,231ms |
| Exit code | `0` |

## Recommendation

⚠️ MERGE WITH WARNING — Confidence: Medium

## Why

• Evaluation command completed successfully.
• AI behavior files changed — human review recommended.
• Existing tests cannot determine behavioral impact.

Behavioral impact: AI-related files changed, but no dedicated behavioral
evaluation (e.g. groundedness, retrieval regression) is configured for
this project — only the evaluation command's exit status was checked.

Changed: `prompts/system.txt`

---
Did this report change your merge decision?
✅ Yes, I merged because of it · ⚠️ Yes, I delayed or blocked · ➖ No, confirmed · ❌ No, not useful
```

---

## Quickstart

### 1. Install

```bash
pip install vouqis-verify
```

Or, for an isolated CLI install:

```bash
pipx install vouqis-verify
```

> On macOS, `pip3 install` / `python3 -m pip install` may fail with a PEP 668 "externally-managed-environment" error. Use `pipx`, or `python3 -m venv` first.
> Requires Python 3.11+ and Git.

### 2. Initialise

```bash
vouqis init
```

This creates a `vouqis.yml` in your current directory.

### 3. Configure

```yaml
# vouqis.yml
eval_command: pytest tests/eval/ -v   # any command — pytest, promptfoo, braintrust, custom script
baseline: main
ai_paths:
  - prompts/
  - src/agents/
  - config/models/
```

### 4. Add the GitHub Action

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
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Verify AI changes
        uses: Sasisundar2211/VouqisVerify/packages/verify@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

That's it. Every PR that touches your AI paths now gets a deployment review.

---

## How it works

```
Push commit
  ↓
GitHub Action triggers
  ↓
vouqis verify
  ├── Detects changed AI files (git diff vs baseline)
  ├── Runs your eval_command
  └── Generates deployment review
        ↓
        PR comment posted
        ↓
        Engineer reads recommendation → merges or blocks
```

Vouqis does **not** run your evals for you. It runs the command you already have. This means it works with any evaluation framework: pytest, promptfoo, braintrust, a custom shell script, or nothing at all — just exit 0 or exit 1.

---

## CLI reference

```
vouqis init               Generate a default vouqis.yml
vouqis verify             Run evaluation and generate deployment review
  --config PATH           Config file (default: vouqis.yml)
  --base BRANCH           Base branch to diff against (overrides config)
  --pr INT                PR number (set automatically in GitHub Actions)
  --repo OWNER/REPO       GitHub repository (set automatically in GitHub Actions)
  --token TOKEN           GitHub token (set automatically in GitHub Actions)
  --no-comment            Skip posting the PR comment
  --json                  Print structured JSON to stdout (for integrations)
vouqis doctor             Validate config and environment
  --config PATH           Config file to validate (default: vouqis.yml)
vouqis --version          Print version and exit
```

---

## Configuration reference

```yaml
# eval_command: shell command to run your evaluations
#   exit 0  → PASS
#   exit 1+ → FAIL
eval_command: pytest tests/eval/ -v

# baseline: branch to compare against for detecting AI file changes
baseline: main

# ai_paths: directories or file prefixes that contain AI-related code
#   Only changes to these paths affect the confidence rating.
#   The eval command runs regardless.
ai_paths:
  - prompts/         # prompt templates
  - src/agents/      # agent workflow code
  - evals/           # evaluation suites
  - models/          # model configuration
  - rag/             # retrieval / RAG configuration
  - tools/           # tool integrations

# timeout_seconds: kill the eval command if it runs longer than this
timeout_seconds: 300

# feedback_url: base link for the "did this change your merge decision?"
#   question appended to PR comments
#   Defaults to https://vouqis.tech/verify-feedback
# feedback_url: https://forms.gle/yourform
```

---

## Confidence levels

| Verdict | Confidence | When |
|---|---|---|
| ✅ SAFE TO MERGE | High | Eval passed, no AI files changed |
| ⚠️ MERGE WITH WARNING | Medium | Eval passed, AI files changed — **or** the diff against baseline could not be determined |
| ❌ BLOCK MERGE | High | Eval failed |

An undeterminable diff (for example, a shallow CI checkout without `fetch-depth: 0`) is treated as unknown, not safe — it always downgrades to `MERGE WITH WARNING` and is never reported as `SAFE TO MERGE`.

---

## Local testing

**macOS**
```bash
cd packages/verify
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest
vouqis verify --no-comment
```

**Windows** (PowerShell)
```powershell
cd packages\verify
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
pytest
vouqis verify --no-comment
```

> **Windows:** If Activate.ps1 is blocked, run `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` once, then retry.
>
> **macOS:** If `python3 -m venv` fails, run `brew install python@3.11` first.

---

## Supported evaluation frameworks

Vouqis Verify runs any shell command via the OS default shell (`cmd.exe` on Windows, `sh` on macOS/Linux). Examples:

```yaml
# pytest (works on both platforms)
eval_command: pytest tests/eval/ -v

# promptfoo (works on both platforms)
eval_command: promptfoo eval --config promptfooconfig.yaml

# braintrust (works on both platforms)
eval_command: braintrust run evals/

# custom shell script — macOS/Linux only
eval_command: ./scripts/run-evals.sh

# custom batch script — Windows only
eval_command: scripts\run-evals.bat

# multiple steps (works on both platforms)
eval_command: pytest tests/unit/ && pytest tests/eval/
```

> **Windows note:** Shell scripts (`.sh`) require Git Bash or WSL. Use `.bat` files or `pytest` directly for native Windows support.

---

## Feedback

Every PR comment ends with a decision-focused question — "Did this report change your merge decision?" — and links for each answer. The link target is configurable via `feedback_url` in `vouqis.yml`; point it at whatever your team already uses to collect responses (a form, an issue template, a Slack webhook). Vouqis Verify itself does not run a feedback collection service.
