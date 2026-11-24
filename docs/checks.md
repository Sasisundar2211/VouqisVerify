# Check reference

Every check accepts `type` (required) and `name` (optional display name). Results and metrics are keyed by `name`, or by `type` when no name is set. A second check of the same type in one case becomes `type#2`.

`vouqis checks` prints this list from the installed version.

Kind: **D** deterministic, **H** heuristic. Metrics are higher-is-better values in [0, 1]. Baseline comparison flags a drop in any metric.

## Answer checks

| Type | Kind | Parameters | Passes when |
| --- | --- | --- | --- |
| `answer_present` | D | none | `answer` is a non-empty string after trimming. |
| `contains` | D | `value` (string or list), `case_sensitive` (default false) | The answer contains every value. |
| `not_contains` | D | `value`, `case_sensitive` (default false) | The answer contains none of the values. |
| `equals` | D | `value`, `case_sensitive` (default true) | The trimmed answer equals `value`. |
| `regex` | D | `pattern`, `ignore_case`, `must_match` (default true) | `re.search` finds the pattern (or finds nothing when `must_match: false`). |
| `json_valid` | D | `required_keys` (list) | The answer parses as JSON. With `required_keys`, it is an object holding those keys. |
| `answer_length` | D | `min`, `max` | The answer length in characters is within bounds. |
| `metadata_equals` | D | `key`, `value` | `metadata[key] == value`. |
| `max_latency_ms` | D | `value` | One invocation finished within `value` milliseconds. |

## Retrieval checks

Retrieval metrics read `contexts[].id` in ranked order. Every context needs an `id`, or the check fails with a message saying so.

| Type | Kind | Parameters | Passes when | Metric |
| --- | --- | --- | --- | --- |
| `min_contexts` | D | `value` | At least `value` contexts were returned. | |
| `retrieval_recall` | D | `expected_ids`, `k`, `min` (default 1.0) | Share of expected ids present in the top `k` is at least `min`. | `recall` |
| `retrieval_precision` | D | `expected_ids`, `k`, `min` (default 0.0) | Share of the top `k` that are expected ids is at least `min`. | `precision` |
| `retrieval_mrr` | D | `expected_ids`, `min` (default 0.0) | 1 / rank of the first expected id is at least `min`. | `mrr` |
| `context_excludes_ids` | D | `ids` | No returned context has one of these ids. Use it for tenant and permission isolation. | |
| `context_contains` | D | `value`, `case_sensitive` | The joined context text contains every value. Catches dropped documents and truncation. | |
| `max_context_chars` | D | `value` | Total context characters are at most `value`. | |
| `groundedness` | H | `min` (default 0.8), `overlap` (default 0.6) | Share of answer sentences whose content words appear in the context at a rate of at least `overlap` is at least `min`. | `score` |

`groundedness` is lexical. It rewards answers that reuse context wording and penalizes faithful paraphrase. It does not detect contradictions. Calibrate `min` on your own baseline.

## Agent checks

Agent checks read `tool_calls` (in call order) and `stop_reason`.

| Type | Kind | Parameters | Passes when |
| --- | --- | --- | --- |
| `tool_called` | D | `tool`, `min_times` (default 1), `max_times` | The tool was called a number of times within bounds. |
| `tool_not_called` | D | `tool` | The tool was never called. |
| `tool_sequence` | D | `sequence`, `exact` (default false) | The tools appear in this order as a subsequence, or match exactly with `exact: true`. |
| `tool_args` | D | `tool`, `args` | At least one call to the tool had arguments containing `args` (nested subset match). |
| `tool_args_required` | D | `tool`, `keys` | Every call to the tool supplied each key with a non-null value. |
| `no_tool_errors` | D | `allow` (list of tool names) | No tool call recorded an `error`, ignoring tools in `allow`. |
| `max_tool_calls` | D | `value` | Total tool calls are at most `value`. |
| `max_repeated_calls` | D | `value` (default 2) | No identical call (same tool, same arguments) ran more than `value` times in a row. |
| `stop_reason` | D | `value` (string or list) | `stop_reason` is one of the values. |

## Execution failures

These are not checks. They fail the case directly:

- The target raised an exception: `error: ValueError: ...`
- The target exceeded `target.timeout_s`: `error: Timeout: ...`
- The target returned a value outside the [output contract](targets.md): `error: InvalidOutput: ...`

A check that raises an exception reports a failure with the exception text. It never reports a pass.
