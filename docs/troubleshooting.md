# Troubleshooting

**`vouqis: error: Importing module 'x' failed: ModuleNotFoundError`**
Use the file form `path/to/file.py:function` (relative to the suite file), or run from the directory that makes the package importable. Run `vouqis validate suite.yaml` to test the import without running cases.

**`error: InvalidOutput: ...`**
The target returned something outside the [output contract](targets.md). The message names the field. Common causes: returning a framework object instead of a dict, or contexts without a `text` field.

**`retrieval metrics need an 'id' on every context item`**
Return `{"id": ..., "text": ...}` for each context instead of plain strings.

**`error: Timeout: no result after N s`**
Raise `target.timeout_s`, or set it to `null`. The timed-out call keeps running in a background thread until the process exits.

**Many drift warnings after an intended change**
Drift is a warning unless `drift` is in `compare.fail_on`. After you confirm the new behavior, record a new baseline with `--save-baseline`.

**`Note: suite definition changed since the baseline`**
You edited cases, inputs, checks, or `repeat` after recording the baseline. Re-record the baseline once the suite is final.

**Flaky failures with an LLM target**
Use `repeat` with `min_pass_rate`, assert on facts instead of wording, and lower temperature. A pass-rate drop on a repeated case appears as a `metric` finding even when the case still passes.

**`Unsupported run schema_version`**
The baseline came from an incompatible version. Re-record it with the installed version.

**Exit code 2 in CI**
A configuration problem, not a regression. The error line starts with `vouqis: error:` on stderr.
