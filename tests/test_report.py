from __future__ import annotations

import json
from xml.etree import ElementTree as ET

from vouqis_verify.compare import compare_runs, verdict
from vouqis_verify.models import Attempt, CaseResult, CheckResult, Output, RunResult
from vouqis_verify.report import load_run, save_run, to_json, to_junit, to_markdown, to_text


def sample():
    ok = CaseResult("ok|case", "q", [Attempt(Output(answer="a"), [CheckResult("c", True, "fine")], 5.0)])
    bad = CaseResult("bad", "q", [Attempt(Output(answer="b"), [CheckResult("c", False, "broke | badly")], 5.0)])
    err = CaseResult("err", "q", [Attempt(None, [], 5.0, error="ValueError: <boom> & more")])
    return RunResult("suite", "f", "t:f", "now", 15.0, [ok, bad, err], "0")


def test_junit_is_well_formed_and_counts():
    run = sample()
    root = ET.fromstring(to_junit(run, None))
    assert root.get("tests") == "3"
    assert root.get("failures") == "1"
    assert root.get("errors") == "1"
    err = root.find("testcase[@name='err']/error")
    assert err is not None and "<boom> & more" in err.get("message")


def test_markdown_escapes_table_cells():
    run = sample()
    md = to_markdown(run, None, verdict(run, None))
    assert "ok\\|case" in md
    assert "broke \\| badly" in md
    assert "(Failed)" in md


def test_text_and_json():
    run = sample()
    base = RunResult(
        "suite",
        "f",
        "t:f",
        "now",
        1.0,
        [CaseResult("bad", "q", [Attempt(Output(answer="b"), [CheckResult("c", True, "fine")], 5.0)])],
        "0",
    )
    comparison = compare_runs(base, run)
    v = verdict(run, comparison)
    text = to_text(run, comparison, v)
    assert "RESULT: FAILED" in text and "[status] bad" in text
    payload = json.loads(to_json(run, comparison, v))
    assert payload["passed"] is False
    assert payload["comparison"]["counts"]["error"] >= 1


def test_save_and_load_with_unserializable_values(tmp_path):
    run = sample()
    run.cases[0].attempts[0].output.metadata["obj"] = object()
    save_run(run, tmp_path / "nested" / "run.json")
    loaded = load_run(tmp_path / "nested" / "run.json")
    assert [c.id for c in loaded.cases] == ["ok|case", "bad", "err"]
