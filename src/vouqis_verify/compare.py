"""Compare a current run against a baseline run and classify the differences.

Finding categories:

* ``status``  - a case passed in the baseline and fails now (or errors now).
* ``metric``  - a check metric (all higher-is-better) or the case pass rate dropped
  by more than ``metric_tolerance``.
* ``drift``   - behavior changed without failing a check: the answer text moved
  (token similarity below ``drift_threshold``, a heuristic), the tool-call
  sequence changed, or the retrieved context ids changed.
* ``latency`` - mean latency grew by more than ``latency_factor`` and by at least
  ``latency_min_ms``.
* ``coverage`` - cases added to or removed from the suite (informational).

A finding is an ``error`` when its category is listed in ``fail_on``, otherwise a
``warning``. Improvements and added cases are ``info``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .config import CompareConfig
from .models import CaseResult, RunResult
from .textutil import jaccard, similarity

ERROR, WARNING, INFO = "error", "warning", "info"


@dataclass
class Finding:
    severity: str
    category: str
    case_id: str
    message: str
    baseline: Any = None
    current: Any = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "severity": self.severity,
            "category": self.category,
            "case_id": self.case_id,
            "message": self.message,
            "baseline": self.baseline,
            "current": self.current,
        }


@dataclass
class Comparison:
    findings: List[Finding] = field(default_factory=list)
    fingerprint_changed: bool = False

    @property
    def errors(self) -> List[Finding]:
        return [f for f in self.findings if f.severity == ERROR]

    @property
    def warnings(self) -> List[Finding]:
        return [f for f in self.findings if f.severity == WARNING]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "fingerprint_changed": self.fingerprint_changed,
            "counts": {
                ERROR: len(self.errors),
                WARNING: len(self.warnings),
                INFO: sum(1 for f in self.findings if f.severity == INFO),
            },
            "findings": [f.to_dict() for f in self.findings],
        }


def _severity(category: str, cfg: CompareConfig) -> str:
    return ERROR if category in cfg.fail_on else WARNING


def _failure_summary(case: CaseResult) -> str:
    attempt = case.primary
    if attempt is None:
        return "no attempts"
    if attempt.error:
        return attempt.error
    failed = [f"{c.name}: {c.message}" for c in attempt.checks if not c.passed]
    return "; ".join(failed) if failed else f"pass rate {case.pass_rate:.2f} below {case.min_pass_rate:.2f}"


def _answer(case: CaseResult) -> Optional[str]:
    a = case.primary
    return a.output.answer if a and a.output else None


def _tool_names(case: CaseResult) -> Optional[List[str]]:
    a = case.primary
    return [t.name for t in a.output.tool_calls] if a and a.output else None


def _context_ids(case: CaseResult) -> Optional[List[str]]:
    a = case.primary
    if not a or not a.output or not a.output.contexts:
        return None
    ids = [c.id for c in a.output.contexts]
    return None if any(i is None for i in ids) else [str(i) for i in ids]


def _compare_case(base: CaseResult, cur: CaseResult, cfg: CompareConfig, out: List[Finding]) -> None:
    cid = cur.id
    status_changed = base.passed != cur.passed

    if base.passed and not cur.passed:
        out.append(
            Finding(
                _severity("status", cfg),
                "status",
                cid,
                f"regressed: passed in baseline, fails now ({_failure_summary(cur)})",
                "pass",
                "fail",
            )
        )
    elif not base.passed and cur.passed:
        out.append(Finding(INFO, "status", cid, "fixed: failed in baseline, passes now", "fail", "pass"))

    # Metric drops (mean across attempts). Skip metrics the current run cannot
    # compute (e.g. the case errored); the status finding already covers that.
    base_metrics, cur_metrics = base.metrics(), cur.metrics()
    if not status_changed:
        # Pass rate only adds information when status held, e.g. 1.0 -> 0.67 on a
        # repeated case that still clears min_pass_rate.
        base_metrics["case.pass_rate"] = base.pass_rate
        cur_metrics["case.pass_rate"] = cur.pass_rate
    for key in sorted(base_metrics.keys() & cur_metrics.keys()):
        b, c = base_metrics[key], cur_metrics[key]
        if b - c > cfg.metric_tolerance + 1e-9:
            out.append(
                Finding(
                    _severity("metric", cfg),
                    "metric",
                    cid,
                    f"{key} dropped {b:.3f} -> {c:.3f}",
                    round(b, 4),
                    round(c, 4),
                )
            )
        elif c - b > cfg.metric_tolerance + 1e-9:
            out.append(Finding(INFO, "metric", cid, f"{key} improved {b:.3f} -> {c:.3f}", round(b, 4), round(c, 4)))

    # Drift: only meaningful when both runs produced output.
    b_ans, c_ans = _answer(base), _answer(cur)
    if b_ans is not None and c_ans is not None:
        sim = similarity(b_ans, c_ans)
        if sim < cfg.drift_threshold:
            out.append(
                Finding(
                    _severity("drift", cfg),
                    "drift",
                    cid,
                    f"answer changed (similarity {sim:.2f} < {cfg.drift_threshold:.2f}, heuristic)",
                    b_ans[:200],
                    c_ans[:200],
                )
            )

    b_tools, c_tools = _tool_names(base), _tool_names(cur)
    if b_tools is not None and c_tools is not None and b_tools != c_tools:
        out.append(
            Finding(
                _severity("drift", cfg), "drift", cid, f"tool sequence changed {b_tools} -> {c_tools}", b_tools, c_tools
            )
        )

    b_ids, c_ids = _context_ids(base), _context_ids(cur)
    if b_ids is not None and c_ids is not None and b_ids != c_ids:
        overlap = jaccard(set(b_ids), set(c_ids))
        out.append(
            Finding(
                _severity("drift", cfg),
                "drift",
                cid,
                f"retrieved context ids changed (overlap {overlap:.2f}) {b_ids} -> {c_ids}",
                b_ids,
                c_ids,
            )
        )

    b_lat, c_lat = base.mean_latency_ms, cur.mean_latency_ms
    if b_lat > 0 and c_lat > b_lat * cfg.latency_factor and c_lat - b_lat >= cfg.latency_min_ms:
        out.append(
            Finding(
                _severity("latency", cfg),
                "latency",
                cid,
                f"mean latency {b_lat:.0f} ms -> {c_lat:.0f} ms (x{c_lat / b_lat:.1f})",
                round(b_lat, 1),
                round(c_lat, 1),
            )
        )


def compare_runs(baseline: RunResult, current: RunResult, cfg: Optional[CompareConfig] = None) -> Comparison:
    cfg = cfg or CompareConfig()
    findings: List[Finding] = []
    for base in baseline.cases:
        cur = current.case(base.id)
        if cur is None:
            findings.append(Finding(WARNING, "coverage", base.id, "case is in the baseline but was not run"))
            continue
        _compare_case(base, cur, cfg, findings)
    for cur in current.cases:
        if baseline.case(cur.id) is None:
            findings.append(Finding(INFO, "coverage", cur.id, "new case, no baseline to compare"))
    order = {ERROR: 0, WARNING: 1, INFO: 2}
    findings.sort(key=lambda f: (order[f.severity], f.case_id, f.category))
    return Comparison(findings=findings, fingerprint_changed=baseline.suite_fingerprint != current.suite_fingerprint)


@dataclass
class Verdict:
    passed: bool
    reasons: List[str]


def verdict(
    current: RunResult,
    comparison: Optional[Comparison],
    *,
    allow_known_failures: bool = False,
    fail_on_warnings: bool = False,
    baseline: Optional[RunResult] = None,
) -> Verdict:
    """Decide the exit status. Failing checks fail the run unless they also failed
    in the baseline and ``allow_known_failures`` is set."""
    reasons: List[str] = []
    for case in current.cases:
        if case.passed:
            continue
        base_case = baseline.case(case.id) if baseline else None
        if allow_known_failures and base_case is not None and not base_case.passed:
            continue
        reasons.append(f"case {case.id!r} failed: {_failure_summary(case)}")
    if comparison:
        for f in comparison.errors:
            if f.category == "status":
                continue  # already reported as a failed case above
            reasons.append(f"[{f.category}] {f.case_id}: {f.message}")
        if fail_on_warnings:
            reasons.extend(f"[warning:{f.category}] {f.case_id}: {f.message}" for f in comparison.warnings)
    return Verdict(passed=not reasons, reasons=reasons)
