"""Checks on agent execution traces (``tool_calls`` and ``stop_reason``)."""

from __future__ import annotations

import json
from typing import Any, List, Mapping

from ..models import CheckResult, Output
from . import CheckContext, check


def _names(out: Output) -> List[str]:
    return [t.name for t in out.tool_calls]


def _is_subset(expected: Any, actual: Any) -> bool:
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(k in actual and _is_subset(v, actual[k]) for k, v in expected.items())
    return expected == actual


@check(
    "tool_called",
    required={"tool"},
    optional={"min_times", "max_times"},
    description="Tool was called within the allowed count.",
)
def tool_called(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    n = _names(out).count(p["tool"])
    lo = int(p.get("min_times", 1))
    hi = p.get("max_times")
    ok = n >= lo and (hi is None or n <= int(hi))
    bound = f">= {lo}" + (f" and <= {hi}" if hi is not None else "")
    return CheckResult("", ok, f"{p['tool']!r} called {n} time(s), expected {bound}")


@check("tool_not_called", required={"tool"}, description="Tool was never called.")
def tool_not_called(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    n = _names(out).count(p["tool"])
    return CheckResult("", n == 0, f"{p['tool']!r} called {n} time(s), expected 0")


@check(
    "tool_sequence",
    required={"sequence"},
    optional={"exact"},
    description="Tools ran in this order (subsequence by default, exact match with exact: true).",
)
def tool_sequence(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    expected = [str(s) for s in p["sequence"]]
    actual = _names(out)
    if p.get("exact"):
        ok = actual == expected
    else:
        it = iter(actual)
        ok = all(any(name == step for name in it) for step in expected)
    return CheckResult("", ok, f"actual sequence {actual}, expected {'exactly ' if p.get('exact') else ''}{expected}")


@check(
    "tool_args",
    required={"tool", "args"},
    description="At least one call to the tool had arguments matching (subset match).",
)
def tool_args(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    calls = [t for t in out.tool_calls if t.name == p["tool"]]
    if not calls:
        return CheckResult("", False, f"{p['tool']!r} was never called")
    if any(_is_subset(p["args"], t.args) for t in calls):
        return CheckResult("", True, f"{p['tool']!r} called with matching args")
    seen = [t.args for t in calls]
    return CheckResult("", False, f"no {p['tool']!r} call matched {p['args']}; saw {seen}")


@check(
    "tool_args_required",
    required={"tool", "keys"},
    description="Every call to the tool supplied these non-null arguments.",
)
def tool_args_required(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    keys = [str(k) for k in p["keys"]]
    problems = []
    for i, t in enumerate(out.tool_calls):
        if t.name != p["tool"]:
            continue
        missing = [k for k in keys if t.args.get(k) is None]
        if missing:
            problems.append(f"call #{i + 1} missing {missing}")
    if problems:
        return CheckResult("", False, f"{p['tool']!r}: " + "; ".join(problems))
    return CheckResult("", True, f"all {p['tool']!r} calls supplied {keys}")


@check(
    "no_tool_errors",
    optional={"allow"},
    description="No tool call recorded an error (catches errors the agent swallowed).",
)
def no_tool_errors(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    allowed = set(p.get("allow", []))
    errors = [f"{t.name}: {t.error}" for t in out.tool_calls if t.error and t.name not in allowed]
    if errors:
        return CheckResult("", False, f"{len(errors)} tool error(s): {errors}")
    return CheckResult("", True, "no tool errors")


@check("max_tool_calls", required={"value"}, description="Total tool calls stayed within a budget.")
def max_tool_calls(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    n = len(out.tool_calls)
    return CheckResult("", n <= int(p["value"]), f"{n} tool call(s), budget {p['value']}")


@check(
    "max_repeated_calls",
    optional={"value"},
    description="No identical call (same tool and args) ran more than N times in a row (retry loops).",
)
def max_repeated_calls(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    limit = int(p.get("value", 2))
    longest, run, prev, worst = 0, 0, None, None
    for t in out.tool_calls:
        key = (t.name, json.dumps(t.args, sort_keys=True, default=str))
        run = run + 1 if key == prev else 1
        prev = key
        if run > longest:
            longest, worst = run, t.name
    ok = longest <= limit
    msg = f"longest identical-call streak is {longest}" + (f" ({worst!r})" if worst else "") + f", limit {limit}"
    return CheckResult("", ok, msg)


@check("stop_reason", required={"value"}, description="Agent terminated with the expected stop reason.")
def stop_reason(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    allowed = [str(v) for v in p["value"]] if isinstance(p["value"], list) else [str(p["value"])]
    ok = out.stop_reason in allowed
    return CheckResult("", ok, f"stop_reason {out.stop_reason!r}, expected one of {allowed}")
