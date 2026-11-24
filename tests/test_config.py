from __future__ import annotations

import json

import pytest

from vouqis_verify.config import load_suite, parse_suite
from vouqis_verify.errors import ConfigError


def base(**over):
    data = {
        "name": "s",
        "target": "t.py:f",
        "cases": [{"id": "c1", "input": "q", "checks": [{"type": "answer_present"}]}],
    }
    data.update(over)
    return data


def test_minimal_suite_and_defaults(tmp_path):
    data = base(defaults={"checks": [{"type": "max_latency_ms", "value": 10}], "repeat": 3, "min_pass_rate": 0.5})
    suite = parse_suite(data, tmp_path / "s.yaml")
    case = suite.cases[0]
    assert [c["type"] for c in case.checks] == ["max_latency_ms", "answer_present"]
    assert (case.repeat, case.min_pass_rate) == (3, 0.5)
    assert suite.target.callable == "t.py:f"
    assert suite.compare.fail_on == ["status", "metric"]


def test_fingerprint_tracks_definition_not_target(tmp_path):
    a = parse_suite(base(), tmp_path / "s.yaml")
    b = parse_suite(base(target={"callable": "other.py:g", "kwargs": {"k": 1}}), tmp_path / "s.yaml")
    changed = base()
    changed["cases"][0]["input"] = "different"
    c = parse_suite(changed, tmp_path / "s.yaml")
    assert a.fingerprint() == b.fingerprint()
    assert a.fingerprint() != c.fingerprint()


@pytest.mark.parametrize(
    "data, message",
    [
        ({"target": "t.py:f", "cases": []}, "non-empty 'cases'"),
        ({"cases": [{"id": "a", "input": 1, "checks": [{"type": "answer_present"}]}]}, "missing 'target'"),
        (base(target="nocolon"), "target.callable"),
        (base(target={"callable": "t.py:f", "timeout_s": 0}), "timeout_s must be >="),
        (base(extra=1), "unknown key"),
        (base(cases=[{"id": "a", "input": 1, "checks": [{"type": "nope"}]}]), "unknown check type 'nope'"),
        (base(cases=[{"id": "a", "input": 1, "checks": [{"type": "contains"}]}]), "missing required parameter"),
        (
            base(cases=[{"id": "a", "input": 1, "checks": [{"type": "contains", "value": "x", "vaule": 1}]}]),
            "unknown parameter",
        ),
        (base(cases=[{"id": "a", "input": 1, "checks": []}]), "has no checks"),
        (base(cases=[{"id": "a", "checks": [{"type": "answer_present"}]}]), "missing 'input'"),
        (
            base(
                cases=[
                    {"id": "a", "input": 1, "checks": [{"type": "answer_present"}]},
                    {"id": "a", "input": 2, "checks": [{"type": "answer_present"}]},
                ]
            ),
            "duplicate case id",
        ),
        (base(cases=[{"id": "a", "input": 1, "repeat": 0, "checks": [{"type": "answer_present"}]}]), "repeat"),
        (
            base(cases=[{"id": "a", "input": 1, "min_pass_rate": 1.5, "checks": [{"type": "answer_present"}]}]),
            "min_pass_rate",
        ),
        (base(compare={"fail_on": ["vibes"]}), "fail_on"),
        (base(compare={"drift_threshold": True}), "must be a number"),
        (base(compare={"allow_known_failures": "yes"}), "true or false"),
        (base(cases=[{"id": "a", "input": 1, "checks": [{"type": "answer_present", "name": ""}]}]), "non-empty string"),
    ],
)
def test_invalid_suites(tmp_path, data, message):
    with pytest.raises(ConfigError, match=message):
        parse_suite(data, tmp_path / "s.yaml")


def test_load_yaml_and_json(tmp_path):
    (tmp_path / "s.json").write_text(json.dumps(base()))
    assert load_suite(tmp_path / "s.json").name == "s"
    (tmp_path / "s.yaml").write_text(
        "name: y\ntarget: t.py:f\ncases:\n- {id: a, input: 1, checks: [{type: answer_present}]}\n"
    )
    assert load_suite(tmp_path / "s.yaml").name == "y"


def test_load_errors(tmp_path):
    with pytest.raises(ConfigError, match="not found"):
        load_suite(tmp_path / "missing.yaml")
    (tmp_path / "bad.yaml").write_text("cases: [unclosed")
    with pytest.raises(ConfigError, match="Cannot parse"):
        load_suite(tmp_path / "bad.yaml")


def test_yaml_python_tags_are_rejected(tmp_path):
    # safe_load must refuse object-construction tags instead of executing them.
    (tmp_path / "tagged.yaml").write_text("!!python/object/apply:builtins.print ['should not run']\n")
    with pytest.raises(ConfigError, match="Cannot parse"):
        load_suite(tmp_path / "tagged.yaml")
