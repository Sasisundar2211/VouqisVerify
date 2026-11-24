# Configuration reference

A suite is a YAML (`.yaml`, `.yml`) or JSON (`.json`) file. YAML loads with `yaml.safe_load`. Unknown keys at any level are errors, so a typo fails loudly at load time instead of disabling a setting.

```yaml
name: support-rag              # optional, defaults to the file name

target:                        # or a plain string: "pipeline.py:answer"
  callable: pipeline.py:answer # "file.py:function" (relative to this file) or "package.module:function"
  kwargs: {top_k: 3}           # keyword arguments passed on every call
  timeout_s: 60                # per invocation; null disables the timeout

defaults:                      # applied to every case
  checks: [{type: answer_present}]
  repeat: 1                    # invocations per case
  min_pass_rate: 1.0           # share of invocations that must pass

compare:                       # used when a baseline is given
  fail_on: [status, metric]    # any of: status, metric, drift, latency
  metric_tolerance: 0.0        # allowed absolute drop in a metric
  drift_threshold: 0.6         # answer similarity below this is drift
  latency_factor: 2.0          # mean latency must grow by this factor...
  latency_min_ms: 50           # ...and by at least this many ms
  allow_known_failures: false  # do not fail on cases that also failed in the baseline

cases:
  - id: refund-window          # unique, stable: comparison matches cases by id
    input: How many days do customers have to request a refund?
    repeat: 3                  # overrides defaults
    min_pass_rate: 0.67
    checks:
      - {type: contains, value: 30 days}
```

## Target

The callable receives `input` as its only positional argument plus `kwargs`. `input` is any YAML value: a string, a list, or a mapping such as `{question: ..., tenant: ...}`.

For `file.py:function`, the file path resolves relative to the suite file. For `module:function`, the current directory and the suite directory join `sys.path` first. Nested attributes work: `module:Class.method`.

`-T key=value` on the command line overrides one kwarg. The value parses as JSON when possible (`-T top_k=1` is the integer 1, `-T flag=true` is a boolean), otherwise it stays a string.

## Cases and checks

A case needs at least one check, from its own `checks` or from `defaults.checks`. Default checks run first. See the [check reference](checks.md).

A case passes when its pass rate (passing invocations / `repeat`) is at least `min_pass_rate`. An invocation passes when it raised no error, returned a valid output, and every check passed.

## Compare categories

| Category | Finding |
| --- | --- |
| `status` | A case passed in the baseline and fails now. |
| `metric` | A check metric or the case pass rate dropped by more than `metric_tolerance`. Pass rate is compared only when the case status did not change. |
| `drift` | The answer similarity fell below `drift_threshold` (heuristic), the tool-call sequence changed, or the retrieved context ids changed. |
| `latency` | Mean latency grew by `latency_factor` and by `latency_min_ms`. |
| `coverage` | A baseline case did not run (warning) or a new case has no baseline (info). Never an error. |

Categories in `fail_on` produce errors and fail the run. Others produce warnings, which fail the run only with `--fail-on-warnings`. Improvements and fixed cases are reported as info.

A failing check always fails the run, with or without a baseline. `allow_known_failures` (or `--allow-known-failures`) excuses only cases that also failed in the baseline. It never excuses a new failure.

## Baseline files

A baseline is the JSON from `--save-baseline` or `--output`. It holds every case's input, outputs, check results, metrics, and latency, plus `schema_version`, `tool_version`, and a `suite_fingerprint`. When the fingerprint differs (cases, inputs, checks, or repeat changed), the report says so, since some differences then come from the suite edit rather than the workflow.

Baselines contain your workflow's outputs and retrieved text. Review them before committing them to a public repository.
