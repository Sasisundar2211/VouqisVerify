# Contributing

Bug reports and pull requests are welcome at https://github.com/Sasisundar2211/VouqisVerify/issues.

## Set up

```sh
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
```

## Before you open a pull request

```sh
ruff check src tests examples
ruff format --check src tests examples
mypy
pytest
```

CI runs the same commands on Python 3.9 to 3.13, builds the package, installs the wheel in a clean environment, and runs the GitHub Action against the examples.

## Guidelines

- Every bug fix comes with a test that fails without the fix.
- A new check needs a row in `tests/test_checks.py` and an entry in `docs/checks.md`. Tests fail until both exist.
- Checks must be deterministic and must not call the network or a model. Label lexical approximations with `kind=HEURISTIC`.
- An error inside the tool or the target must surface as a failure, never as a pass.
- Keep runtime dependencies at PyYAML only unless there is a strong reason to add one.
- Never include credentials, customer data, or private model outputs in issues, fixtures, or baselines.
