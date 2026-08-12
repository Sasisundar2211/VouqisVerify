# Vouqis Codebase Standard

This document is the durable engineering baseline for every maintained
package in this repository. Product-specific instructions may add constraints,
but they cannot relax these requirements.

## Product boundary

The repository is restricted to the Vouqis Verify MVP and its core engineering
infrastructure. The authoritative product definition is in
[`docs/product-scope.md`](product-scope.md). Do not add dashboards, landing
pages, marketing websites, unrelated prototypes, or deprecated product packages.

## Repository boundaries

- `packages/verify/` contains the supported Vouqis Verify Python package.
- `docs/` contains product and engineering documentation.
- `.github/workflows/` contains the required CI checks.
- Generated output, local databases, credentials, virtual environments, and
  tool state must not be committed.

## Source and documentation

- Use UTF-8, LF line endings, and a final newline. `.editorconfig` is the
  repository-wide source of truth for editor behavior.
- Keep production code, tests, and documentation in the same focused change.
- Prefer small, explicit functions and typed public interfaces. Avoid broad
  refactors in feature or bug-fix pull requests.
- Add or update tests for every behavior change. Tests must be deterministic
  and portable across supported operating systems.
- Keep user-facing documentation accurate whenever commands, configuration, or
  behavior changes.

## Python package standard

Vouqis Verify supports Python 3.11 and 3.12. The package configuration in
`packages/verify/pyproject.toml` is authoritative for dependencies, tooling,
and test settings.

Run these checks before opening a pull request:

```powershell
Set-Location packages/verify
uv sync --all-extras
uv run ruff format --check .
uv run ruff check .
uv run pytest -q
uv build --wheel
```

Use `uv run ruff format .` to apply formatting. Do not hand-edit lockfiles;
regenerate `uv.lock` with `uv lock` whenever dependencies change.

## Pull-request gate

A change may merge only when the required GitHub Actions checks pass:

1. Formatting is clean.
2. Linting is clean.
3. Tests pass on every supported Python version.
4. The PR contains focused code, tests, and documentation appropriate to its
   scope.

## Dependency and security hygiene

- Add the narrowest compatible dependency range necessary for the package.
- Commit the updated lockfile with every dependency change.
- Never commit secrets or use real credentials in tests, examples, or docs.
- Treat generated reports and local artifacts as disposable unless explicitly
  required by a feature.

## Engineering principles

- Apply YAGNI: implement only what an existing requirement needs.
- Keep solutions simple, readable, and direct (KISS).
- Eliminate duplication where it has a real maintenance cost (DRY).
- Establish clear modular boundaries and explicit dependencies.
- Do not introduce circular dependencies, premature abstractions, or unnecessary rewrites.
- Do not make large speculative refactors.

## Architecture

Organize code around actual Vouqis Verify responsibilities:

- configuration
- CLI
- Git and change detection
- AI change detection
- evaluation
- Review Package generation
- GitHub and CI integration
- tests

Create an abstraction only when it solves an existing, demonstrated problem.

## Git workflow

- Never develop directly on `main`.
- Use focused `feature/`, `fix/`, or `refactor/` branches.
- Keep commits atomic and use Conventional Commits.
- Commit messages must describe the change; vague commits are not acceptable.

## Pull requests

Every pull request must explain:

- what changed
- why it changed
- how it was tested
- risks and limitations

## Quality and review

Before committing:

- inspect `git status`
- inspect the complete diff
- remove unrelated changes
- run relevant tests and quality checks

Every change must pass applicable tests, linting, formatting, and build or package checks.

## Vouqis safety

`diff_failed` must never produce `SAFE TO MERGE`.
Never silently treat unknown state as success.

## Decision-making

- Optimize for correctness, readability, testability, maintainability, reproducibility, and developer experience over architectural complexity.
- Do not make architectural changes without first inspecting the existing codebase and explaining the concrete problem the change solves.
- When uncertain, stop and report the ambiguity rather than guessing.

## Security

- Never commit secrets or hardcode credentials.
- Use environment variables or approved secret mechanisms for sensitive values.
- Keep `.gitignore` precise and limited to generated, local, or sensitive files.
