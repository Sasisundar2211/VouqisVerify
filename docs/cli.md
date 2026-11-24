# CLI reference

```text
vouqis [--version] {run,compare,validate,init,checks}
```

Exit codes for every command: 0 passed, 1 verification failed, 2 usage or configuration error. Errors print one line starting with `vouqis: error:` on stderr.

## vouqis init

Write a starter `vouqis.yaml` and `vouqis_target.py`.

| Option | Meaning |
| --- | --- |
| `directory` | Where to write. Default: the current directory. |
| `--template {rag,agent}` | Starter type. Default: `rag`. |
| `--force` | Overwrite existing files. Without it, existing files are left alone and the command exits 2. |

The generated target raises `NotImplementedError` until you connect your workflow, so a fresh scaffold fails with that message rather than passing on canned output.

## vouqis run

Run a suite. Optionally compare with a baseline.

| Option | Meaning |
| --- | --- |
| `suite` | Suite file (`.yaml`, `.yml`, `.json`). |
| `--baseline PATH` | Compare against this run JSON. A missing file exits 2. |
| `--save-baseline PATH` | Write this run as a baseline. |
| `--output PATH` | Write this run's full results as JSON. |
| `-T, --target-arg KEY=VALUE` | Override one target kwarg. VALUE parses as JSON when possible. Repeatable. |
| `--case ID` | Run only this case. Repeatable. An unknown id exits 2. |
| `-j, --workers N` | Run N cases at once in threads. Default 1. Your target must be thread-safe. Repeats of one case still run in order. |
| `-q, --quiet` | No per-case progress lines on stderr. |

Output options shared with `compare`:

| Option | Meaning |
| --- | --- |
| `--format {text,json}` | stdout format. Default `text`. |
| `--markdown PATH` | Write a Markdown report. |
| `--junit PATH` | Write JUnit XML. |
| `--fail-on-warnings` | Comparison warnings also fail the run. |
| `--allow-known-failures` | Do not fail on cases that also failed in the baseline. |
| `--no-github-summary` | Skip appending to `$GITHUB_STEP_SUMMARY` inside GitHub Actions. |
| `-v, --verbose` | Show passing checks too. |

With `--workers`, latency figures include time spent waiting for shared resources, so latency findings between runs with different worker counts are not comparable.

## vouqis compare

Compare two saved run files without running anything.

| Option | Meaning |
| --- | --- |
| `baseline`, `current` | Run JSON files from `--output` or `--save-baseline`. |
| `--suite SUITE` | Read `compare` settings from this suite. |
| `--fail-on [...]` | Override `compare.fail_on`. Pass none to make every finding a warning. |

## vouqis validate

Load a suite and import its target without running cases. Exits 0 and prints the case and check count, or exits 2 with the problem.

## vouqis checks

List every check type with its kind (deterministic or heuristic) and parameters. Optional parameters appear in brackets.
