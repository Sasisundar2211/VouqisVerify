from __future__ import annotations

from typing import List, Optional

from vouqis_verify.compare import ERROR, INFO, WARNING, compare_runs, verdict
from vouqis_verify.config import CompareConfig
from vouqis_verify.models import Attempt, CaseResult, CheckResult, Context, Output, RunResult, ToolCall


def case(
    cid: str,
    passed: bool = True,
    answer: str = "the answer",
    metrics: Optional[dict] = None,
    tools: Optional[List[str]] = None,
    ctx_ids: Optional[List[str]] = None,
    latency: float = 10.0,
    error: Optional[str] = None,
) -> CaseResult:
    out = (
        None
        if error
        else Output(
            answer=answer,
            tool_calls=[ToolCall(name=t) for t in (tools or [])],
            contexts=[Context(text="t", id=i) for i in (ctx_ids or [])],
        )
    )
    checks = [] if error else [CheckResult("chk", passed, "m", metrics=metrics or {})]
    return CaseResult(id=cid, input=cid, attempts=[Attempt(output=out, checks=checks, latency_ms=latency, error=error)])


def run(*cases: CaseResult, fingerprint: str = "f") -> RunResult:
    return RunResult("s", fingerprint, "t:f", "now", 1.0, list(cases), "0")


def cats(comparison, severity=None):
    return [(f.category, f.case_id) for f in comparison.findings if severity is None or f.severity == severity]


def test_identical_runs_have_no_findings():
    a = run(case("x", metrics={"recall": 1.0}, tools=["t"], ctx_ids=["d"]))
    comparison = compare_runs(a, a)
    assert comparison.findings == []
    assert verdict(a, comparison).passed


def test_status_regression_and_fix():
    comparison = compare_runs(run(case("x"), case("y", passed=False)), run(case("x", passed=False), case("y")))
    assert ("status", "x") in cats(comparison, ERROR)
    assert ("status", "y") in cats(comparison, INFO)


def test_error_counts_as_status_regression():
    comparison = compare_runs(run(case("x")), run(case("x", error="Timeout")))
    assert cats(comparison, ERROR) == [("status", "x")]


def test_metric_drop_respects_tolerance():
    base = run(case("x", metrics={"recall": 1.0}))
    cur = run(case("x", metrics={"recall": 0.9}))
    assert ("metric", "x") in cats(compare_runs(base, cur), ERROR)
    assert compare_runs(base, cur, CompareConfig(metric_tolerance=0.1)).findings == []
    up = compare_runs(cur, base)
    assert cats(up, INFO) == [("metric", "x")]


def test_pass_rate_not_duplicated_when_status_flips():
    # Regression: a pass->fail flip also produced a redundant case.pass_rate error.
    comparison = compare_runs(run(case("x")), run(case("x", passed=False)))
    assert not any("pass_rate" in f.message for f in comparison.findings)


def test_pass_rate_drop_reported_when_status_holds():
    def repeated(rates):
        attempts = [Attempt(Output(answer="a"), [CheckResult("c", ok, "m")], 1.0) for ok in rates]
        return CaseResult("x", "x", attempts, min_pass_rate=0.5)

    comparison = compare_runs(run(repeated([True, True, True])), run(repeated([True, True, False])))
    assert any("case.pass_rate" in f.message and f.severity == ERROR for f in comparison.findings)


def test_drift_is_a_warning_by_default_and_an_error_when_configured():
    base = run(case("x", answer="Refunds take 30 days", tools=["a", "b"], ctx_ids=["d1", "d2"]))
    cur = run(case("x", answer="Totally different text about shipping", tools=["a"], ctx_ids=["d1", "d3"]))
    comparison = compare_runs(base, cur)
    msgs = [f.message for f in comparison.findings]
    assert all(f.severity == WARNING for f in comparison.findings)
    assert any("answer changed" in m for m in msgs)
    assert any("tool sequence changed" in m for m in msgs)
    assert any("retrieved context ids changed" in m for m in msgs)
    strict = compare_runs(base, cur, CompareConfig(fail_on=["drift"]))
    assert {f.severity for f in strict.findings} == {ERROR}


def test_similar_answers_are_not_drift():
    base = run(case("x", answer="Customers can request a refund within 30 days of delivery."))
    cur = run(case("x", answer="Customers can request a full refund within 30 days of delivery."))
    assert compare_runs(base, cur).findings == []


def test_latency_needs_factor_and_absolute_increase():
    assert compare_runs(run(case("x", latency=1)), run(case("x", latency=40))).findings == []  # < 50 ms more
    comparison = compare_runs(run(case("x", latency=100)), run(case("x", latency=400)))
    assert cats(comparison, WARNING) == [("latency", "x")]
    assert compare_runs(run(case("x", latency=100)), run(case("x", latency=180))).findings == []  # < x2


def test_coverage_changes():
    comparison = compare_runs(run(case("old"), fingerprint="a"), run(case("new"), fingerprint="b"))
    assert ("coverage", "old") in cats(comparison, WARNING)
    assert ("coverage", "new") in cats(comparison, INFO)
    assert comparison.fingerprint_changed


def test_verdict_rules():
    base = run(case("x", passed=False), case("y"))
    cur = run(case("x", passed=False), case("y"))
    assert not verdict(cur, compare_runs(base, cur)).passed  # failing check fails the run
    assert verdict(cur, compare_runs(base, cur), allow_known_failures=True, baseline=base).passed
    # A new failure is never excused by allow_known_failures.
    worse = run(case("x", passed=False), case("y", passed=False))
    assert not verdict(worse, compare_runs(base, worse), allow_known_failures=True, baseline=base).passed

    drift_cur = run(case("z", answer="completely unrelated words"))
    drift_cmp = compare_runs(run(case("z", answer="the refund window is thirty days")), drift_cur)
    assert verdict(drift_cur, drift_cmp).passed
    assert not verdict(drift_cur, drift_cmp, fail_on_warnings=True).passed


def test_findings_sorted_by_severity():
    base = run(case("a", answer="alpha beta gamma"), case("b"))
    cur = run(case("a", answer="zzz yyy xxx"), case("b", passed=False))
    order = [f.severity for f in compare_runs(base, cur).findings]
    assert order == sorted(order, key=[ERROR, WARNING, INFO].index)
