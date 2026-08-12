# Vouqis Verify

**AI Change Verification for Engineering Teams**

> **Beta** --- Vouqis Verify is in active development.

**Verify AI changes before they merge.**

Vouqis Verify helps engineering teams generate **deployment evidence**
for AI-related pull requests by detecting AI-related changes, running
existing evaluation pipelines, and publishing structured review evidence
directly to GitHub pull requests.

## Product scope

Vouqis Verify is an early-stage Python tool for reviewing AI-related pull requests before production. See the [product scope](docs/product-scope.md) for the MVP boundary and current claims.


------------------------------------------------------------------------

## Why Vouqis Verify?

AI-related changes are difficult to review manually.

Vouqis Verify automatically:

-   Detects AI-related changes
-   Runs your existing evaluation suite
-   Generates a structured Review Package
-   Helps reviewers make informed merge decisions

## Example Review Package

``` text
✓ Prompt modified
✓ GPT-5 model update
✓ pytest: 42 tests passed

Recommendation
MERGE WITH WARNING

Confidence: 92%
```

## Installation

### Recommended

``` bash
pip install vouqis-verify
vouqis --version
```

### Optional (pipx)

**Windows**

``` powershell
python -m pip install --user pipx
python -m pipx ensurepath

# Restart PowerShell

python -m pipx install vouqis-verify
```

**macOS / Linux**

``` bash
python3 -m pip install --user pipx
python3 -m pipx ensurepath
pipx install vouqis-verify
```

## Quick Start

``` bash
vouqis init
vouqis verify
vouqis verify --json
vouqis doctor
```

Example configuration:

``` yaml
eval_command: pytest
baseline: main
timeout_seconds: 300

ai_paths:
  - prompts/
  - src/agents/
  - evals/
  - models/
  - rag/
  - tools/
```

## GitHub Action

``` yaml
- uses: Sasisundar2211/VouqisVerify/packages/verify@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## CLI

  Command                  Description
  ------------------------ -----------------------
  `vouqis init`            Create configuration
  `vouqis verify`          Verify AI changes
  `vouqis verify --json`   JSON output
  `vouqis doctor`          Validate installation
  `vouqis --version`       Show version

## Philosophy

Vouqis Verify augments existing code review. It does not replace human
reviewers or evaluation frameworks.

## License

MIT
