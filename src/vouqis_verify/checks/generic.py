"""Checks on the final answer and execution, independent of workflow type."""

from __future__ import annotations

import json
import re
from typing import Any, List, Mapping

from ..models import CheckResult, Output
from . import CheckContext, check


def _as_list(value: Any) -> List[str]:
    return [str(v) for v in value] if isinstance(value, list) else [str(value)]


def _answer(output: Output) -> str:
    return output.answer or ""


@check("answer_present", description="Answer is non-empty (catches silent empty outputs).")
def answer_present(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    ok = bool(_answer(out).strip())
    return CheckResult("", ok, "answer is present" if ok else "answer is empty or missing")


@check("contains", required={"value"}, optional={"case_sensitive"}, description="Answer contains every value.")
def contains(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    sensitive = bool(p.get("case_sensitive", False))
    answer = _answer(out) if sensitive else _answer(out).lower()
    missing = [v for v in _as_list(p["value"]) if (v if sensitive else v.lower()) not in answer]
    if missing:
        return CheckResult("", False, f"answer is missing: {missing}")
    return CheckResult("", True, "answer contains all expected values")


@check(
    "not_contains", required={"value"}, optional={"case_sensitive"}, description="Answer contains none of the values."
)
def not_contains(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    sensitive = bool(p.get("case_sensitive", False))
    answer = _answer(out) if sensitive else _answer(out).lower()
    found = [v for v in _as_list(p["value"]) if (v if sensitive else v.lower()) in answer]
    if found:
        return CheckResult("", False, f"answer contains forbidden value(s): {found}")
    return CheckResult("", True, "answer contains no forbidden values")


@check(
    "equals", required={"value"}, optional={"case_sensitive"}, description="Answer equals value (whitespace-trimmed)."
)
def equals(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    sensitive = bool(p.get("case_sensitive", True))
    got, want = _answer(out).strip(), str(p["value"]).strip()
    ok = got == want if sensitive else got.lower() == want.lower()
    return CheckResult("", ok, "answer matches" if ok else f"expected {want!r}, got {got!r}")


@check(
    "regex",
    required={"pattern"},
    optional={"ignore_case", "must_match"},
    description="Answer matches (or must not match) a regex.",
)
def regex(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    flags = re.IGNORECASE if p.get("ignore_case") else 0
    must_match = bool(p.get("must_match", True))
    found = re.search(str(p["pattern"]), _answer(out), flags) is not None
    ok = found == must_match
    verb = "matches" if found else "does not match"
    return CheckResult("", ok, f"answer {verb} /{p['pattern']}/")


@check("json_valid", optional={"required_keys"}, description="Answer parses as JSON; optional required top-level keys.")
def json_valid(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    try:
        data = json.loads(_answer(out))
    except (ValueError, TypeError) as exc:
        return CheckResult("", False, f"answer is not valid JSON: {exc}")
    required = _as_list(p.get("required_keys", []))
    if required:
        if not isinstance(data, dict):
            return CheckResult("", False, "answer JSON is not an object")
        missing = [k for k in required if k not in data]
        if missing:
            return CheckResult("", False, f"answer JSON is missing keys: {missing}")
    return CheckResult("", True, "answer is valid JSON")


@check("answer_length", optional={"min", "max"}, description="Answer character length is within bounds.")
def answer_length(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    n = len(_answer(out))
    lo, hi = p.get("min"), p.get("max")
    if lo is not None and n < int(lo):
        return CheckResult("", False, f"answer has {n} chars, below min {lo}")
    if hi is not None and n > int(hi):
        return CheckResult("", False, f"answer has {n} chars, above max {hi}")
    return CheckResult("", True, f"answer has {n} chars")


@check("max_latency_ms", required={"value"}, description="Single invocation finished within the latency budget.")
def max_latency_ms(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    ok = ctx.latency_ms <= float(p["value"])
    return CheckResult("", ok, f"latency {ctx.latency_ms:.1f} ms (budget {p['value']} ms)")


@check("metadata_equals", required={"key", "value"}, description="output.metadata[key] equals value.")
def metadata_equals(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    key = str(p["key"])
    if key not in out.metadata:
        return CheckResult("", False, f"metadata has no key {key!r}")
    got = out.metadata[key]
    ok = got == p["value"]
    return CheckResult("", ok, f"metadata[{key!r}] = {got!r}" + ("" if ok else f", expected {p['value']!r}"))
