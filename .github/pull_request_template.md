## What

<!-- One or two sentences: what does this change do? -->

## Why

<!-- The problem or need this addresses. Link an issue if one exists. -->

## How to test

<!-- Exact commands a reviewer can run to verify this, e.g.: -->
```bash
cd packages/verify
uv run ruff format --check .
uv run ruff check .
uv run pytest -q
```

## Checklist

- [ ] PR is focused on a single change (see `docs/codebase-standard.md`)
- [ ] Tests added/updated for behavior changes
- [ ] Docs updated if commands, config, or behavior changed
- [ ] CI is green
