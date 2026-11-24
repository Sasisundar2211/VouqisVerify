from __future__ import annotations

import pytest

from vouqis_verify.errors import ConfigError
from vouqis_verify.runner import run_suite

TARGET = """
import time

calls = {"n": 0}

def answer(q, mode="ok"):
    calls["n"] += 1
    if mode == "raise":
        raise ValueError("model unavailable")
    if mode == "sleep":
        time.sleep(2)
    if mode == "bad":
        return 123
    if mode == "flaky":
        return "yes" if calls["n"] % 2 else "no"
    return f"echo {q}"
"""


def suite_data(**target):
    return {
        "name": "r",
        "target": {"callable": "target_mod.py:answer", **target},
        "cases": [
            {"id": "a", "input": "one", "checks": [{"type": "contains", "value": "echo one"}]},
            {"id": "b", "input": "two", "checks": [{"type": "answer_present"}]},
        ],
    }


def test_happy_path(make_suite):
    run = run_suite(make_suite(suite_data(), TARGET))
    assert run.passed
    assert [c.id for c in run.cases] == ["a", "b"]
    assert run.cases[0].primary.output.answer == "echo one"
    assert run.cases[0].primary.latency_ms >= 0


def test_exception_is_recorded_as_error(make_suite):
    run = run_suite(make_suite(suite_data(kwargs={"mode": "raise"}), TARGET))
    attempt = run.cases[0].primary
    assert not run.passed
    assert attempt.error == "ValueError: model unavailable"
    assert attempt.checks == []


def test_invalid_output_is_an_error_not_a_pass(make_suite):
    run = run_suite(make_suite(suite_data(kwargs={"mode": "bad"}), TARGET))
    assert run.cases[0].primary.error.startswith("InvalidOutput:")
    assert not run.passed


def test_timeout(make_suite):
    run = run_suite(make_suite(suite_data(kwargs={"mode": "sleep"}, timeout_s=0.2), TARGET), case_ids=["b"])
    attempt = run.cases[0].primary
    assert attempt.error.startswith("Timeout")
    assert attempt.latency_ms < 1500


def test_overrides_win_over_suite_kwargs(make_suite):
    run = run_suite(make_suite(suite_data(kwargs={"mode": "raise"}), TARGET), target_overrides={"mode": "ok"})
    assert run.passed
    assert run.target_kwargs == {"mode": "ok"}


def test_repeat_and_min_pass_rate(make_suite):
    data = {
        "name": "r",
        "target": {"callable": "target_mod.py:answer", "kwargs": {"mode": "flaky"}},
        "cases": [
            {"id": "strict", "input": "x", "repeat": 4, "checks": [{"type": "equals", "value": "yes"}]},
            {
                "id": "lenient",
                "input": "x",
                "repeat": 4,
                "min_pass_rate": 0.5,
                "checks": [{"type": "equals", "value": "yes"}],
            },
        ],
    }
    run = run_suite(make_suite(data, TARGET))
    strict, lenient = run.cases
    assert len(strict.attempts) == 4 and strict.pass_rate == 0.5 and not strict.passed
    assert lenient.pass_rate == 0.5 and lenient.passed


def test_case_filter(make_suite):
    suite = make_suite(suite_data(), TARGET)
    assert [c.id for c in run_suite(suite, case_ids=["b"]).cases] == ["b"]
    with pytest.raises(ConfigError, match="Unknown case"):
        run_suite(suite, case_ids=["zzz"])


def test_round_trip_through_json(make_suite):
    from vouqis_verify.models import RunResult

    run = run_suite(make_suite(suite_data(), TARGET))
    again = RunResult.from_dict(run.to_dict())
    assert again.to_dict()["cases"] == run.to_dict()["cases"]
    with pytest.raises(ValueError, match="schema_version"):
        RunResult.from_dict({**run.to_dict(), "schema_version": 99})


def test_null_timeout_disables_the_limit(make_suite):
    suite = make_suite(suite_data(timeout_s=None), TARGET)
    assert suite.target.timeout_s is None
    assert run_suite(suite).passed
