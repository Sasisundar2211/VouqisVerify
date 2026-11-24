"""Render run results and comparisons as text, JSON, Markdown, and JUnit XML."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from xml.etree import ElementTree as ET

from .compare import ERROR, INFO, WARNING, Comparison, Verdict
from .models import HEURISTIC, RunResult


def save_run(run: RunResult, path: str | Path) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(run.to_dict(), indent=2, default=str) + "\n", encoding="utf-8")


def load_run(path: str | Path) -> RunResult:
    p = Path(path)
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise
    except ValueError as exc:
        raise ValueError(f"{p} is not valid JSON: {exc}") from exc
    return RunResult.from_dict(data)


def to_json(run: RunResult, comparison: Optional[Comparison], verdict: Verdict) -> str:
    payload: Dict[str, Any] = {
        "passed": verdict.passed,
        "reasons": verdict.reasons,
        "run": run.to_dict(),
        "comparison": comparison.to_dict() if comparison else None,
    }
    return json.dumps(payload, indent=2, default=str)


def _case_lines(run: RunResult, verbose: bool) -> List[str]:
    lines = []
    for case in run.cases:
        mark = "PASS" if case.passed else "FAIL"
        rate = f" pass_rate={case.pass_rate:.2f}" if len(case.attempts) > 1 else ""
        lines.append(f"  {mark}  {case.id}  ({case.mean_latency_ms:.0f} ms){rate}")
        for i, attempt in enumerate(case.attempts):
            prefix = f"      [{i + 1}] " if len(case.attempts) > 1 else "      "
            if attempt.error:
                lines.append(f"{prefix}error: {attempt.error}")
                continue
            for c in attempt.checks:
                if c.passed and not verbose:
                    continue
                tag = " (heuristic)" if c.kind == HEURISTIC else ""
                lines.append(f"{prefix}{'ok ' if c.passed else 'X  '}{c.name}{tag}: {c.message}")
    return lines


def to_text(run: RunResult, comparison: Optional[Comparison], verdict: Verdict, *, verbose: bool = False) -> str:
    passed = sum(1 for c in run.cases if c.passed)
    lines = [f"Vouqis Verify: {run.suite_name}  target={run.target}", ""]
    lines += _case_lines(run, verbose)
    lines += ["", f"Cases: {passed}/{len(run.cases)} passed in {run.duration_ms / 1000:.2f} s"]
    if comparison is not None:
        lines.append("")
        if comparison.fingerprint_changed:
            lines.append("Note: suite definition changed since the baseline; some differences may come from that.")
        if not comparison.findings:
            lines.append("Baseline comparison: no differences.")
        else:
            lines.append(
                f"Baseline comparison: {len(comparison.errors)} error(s), {len(comparison.warnings)} warning(s)"
            )
            for f in comparison.findings:
                lines.append(f"  {f.severity.upper():7} [{f.category}] {f.case_id}: {f.message}")
    lines += ["", "RESULT: PASSED" if verdict.passed else "RESULT: FAILED"]
    if not verdict.passed:
        lines += [f"  - {r}" for r in verdict.reasons]
    return "\n".join(lines) + "\n"


def _md_escape(text: str) -> str:
    return str(text).replace("|", "\\|").replace("\n", " ")


def to_markdown(run: RunResult, comparison: Optional[Comparison], verdict: Verdict) -> str:
    passed = sum(1 for c in run.cases if c.passed)
    status = "Passed" if verdict.passed else "Failed"
    out = [
        f"## Vouqis Verify: {_md_escape(run.suite_name)} ({status})",
        "",
        f"{passed}/{len(run.cases)} cases passed. Target `{run.target}`.",
        "",
    ]
    if comparison is not None:
        counts = comparison.to_dict()["counts"]
        out.append(f"Baseline comparison: {counts[ERROR]} error(s), {counts[WARNING]} warning(s), {counts[INFO]} info.")
        if comparison.fingerprint_changed:
            out.append("Suite definition changed since the baseline.")
        out.append("")
        shown = [f for f in comparison.findings if f.severity != INFO]
        if shown:
            out += ["| Severity | Category | Case | Finding |", "| --- | --- | --- | --- |"]
            out += [
                f"| {f.severity} | {f.category} | {_md_escape(f.case_id)} | {_md_escape(f.message)} |" for f in shown
            ]
            out.append("")

    out += ["| Case | Result | Failed checks |", "| --- | --- | --- |"]
    for case in run.cases:
        failed: List[str] = []
        for a in case.attempts:
            if a.error:
                failed.append(f"error: {a.error}")
            failed += [f"{c.name}: {c.message}" for c in a.checks if not c.passed]
        unique = list(dict.fromkeys(failed))[:3]
        out.append(
            f"| {_md_escape(case.id)} | {'pass' if case.passed else 'fail'} | {_md_escape('; '.join(unique)) or '-'} |"
        )
    if not verdict.passed:
        out += ["", "**Why it failed**", ""] + [f"- {_md_escape(r)}" for r in verdict.reasons]
    return "\n".join(out) + "\n"


def to_junit(run: RunResult, comparison: Optional[Comparison]) -> str:
    regressions: Dict[str, List[str]] = {}
    if comparison:
        for f in comparison.errors:
            regressions.setdefault(f.case_id, []).append(f"[{f.category}] {f.message}")

    suite = ET.Element(
        "testsuite", name=run.suite_name, tests=str(len(run.cases)), time=f"{run.duration_ms / 1000:.3f}"
    )
    failures = errors = 0
    for case in run.cases:
        tc = ET.SubElement(
            suite, "testcase", classname=run.suite_name, name=case.id, time=f"{case.mean_latency_ms / 1000:.3f}"
        )
        attempt_errors = [a.error for a in case.attempts if a.error]
        failed_checks = [f"{c.name}: {c.message}" for a in case.attempts for c in a.checks if not c.passed]
        extra = regressions.get(case.id, [])
        if attempt_errors and not case.passed:
            errors += 1
            ET.SubElement(tc, "error", message=attempt_errors[0]).text = "\n".join(attempt_errors)
        elif not case.passed or extra:
            failures += 1
            detail = failed_checks + extra
            ET.SubElement(tc, "failure", message=(detail[0] if detail else "failed")).text = "\n".join(detail)
    suite.set("failures", str(failures))
    suite.set("errors", str(errors))
    return ET.tostring(suite, encoding="unicode", xml_declaration=True) + "\n"
