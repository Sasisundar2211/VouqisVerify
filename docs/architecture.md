# Architecture

```text
suite.yaml ──> config.load_suite ──> Suite
                                       │
target.load_callable <─────────────────┤
        │                              │
        ▼                              ▼
runner.run_suite: for each case, for each repeat
    _invoke (daemon thread, timeout) ──> raw value | error
    target.normalize_output          ──> Output | InvalidOutput error
    checks.run_checks                ──> [CheckResult]
        │
        ▼
     RunResult ──> report.save_run (baseline JSON)
        │
        ├── compare.compare_runs(baseline, current) ──> Comparison [Finding]
        ├── compare.verdict ──> pass / fail + reasons
        └── report.to_text | to_json | to_markdown | to_junit
```

| Module | Responsibility |
| --- | --- |
| `config.py` | Parse and validate suites. Rejects unknown keys and bad parameters at load time. Computes the suite fingerprint. |
| `target.py` | Import the target callable. Normalize return values into `Output`, rejecting malformed shapes. |
| `runner.py` | Run cases with timeouts and repeats. Exceptions, timeouts, and bad output become attempt errors. |
| `checks/` | Registry plus answer (`generic.py`), retrieval (`rag.py`), and agent (`agent.py`) checks. |
| `compare.py` | Classify differences between two runs into findings and decide the verdict. |
| `report.py` | Save and load runs. Render text, JSON, Markdown, JUnit. |
| `cli.py` | `run`, `compare`, `validate`, `checks`. Maps errors to exit codes. |
| `models.py` | Dataclasses with JSON round-tripping and a schema version. |

## Design rules

- **Failures are never passes.** A target exception, timeout, malformed output, or a check that raises all mark the case failed with the reason attached.
- **Checks are pure.** A check reads one `Output` and returns a result. No check calls the network or a model.
- **Metrics are higher-is-better in [0, 1].** Comparison treats any drop as a regression without per-metric settings.
- **Cases match by id.** Renaming a case id breaks its link to the baseline; the report lists it as removed and added.
- **Heuristics are labeled.** `groundedness` and answer similarity carry the `heuristic` kind in every report.

## Adding a check

Add a function in the matching `checks/` module:

```python
@check("my_check", required={"value"}, optional={"strict"}, description="One-line summary.")
def my_check(p, out, ctx):
    ok = ...
    return CheckResult("", ok, "human-readable reason", metrics={"score": 0.9})
```

The registry validates parameters from `required` and `optional`. Then add a row in `tests/test_checks.py` (a test fails until every registered check has a case) and document it in `docs/checks.md` (a test fails until every check appears there).
