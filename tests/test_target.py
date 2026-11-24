from __future__ import annotations

import pytest

from vouqis_verify.errors import InvalidOutputError, TargetError
from vouqis_verify.models import Output
from vouqis_verify.target import load_callable, normalize_output


def test_string_becomes_answer():
    assert normalize_output("hi").answer == "hi"


def test_full_dict_is_normalized():
    out = normalize_output(
        {
            "answer": "a",
            "contexts": ["plain", {"id": 7, "text": "t", "score": 0.5}, {"page_content": "lc doc"}],
            "tool_calls": [{"name": "search", "arguments": {"q": "x"}, "error": RuntimeError("boom")}],
            "stop_reason": "final_answer",
            "latency_hint": 3,
        }
    )
    assert [c.text for c in out.contexts] == ["plain", "t", "lc doc"]
    assert out.contexts[1].id == "7"  # ids are normalized to strings
    assert out.tool_calls[0].args == {"q": "x"}
    assert out.tool_calls[0].error == "boom"
    assert out.metadata == {"latency_hint": 3}  # unknown keys are kept, not dropped


def test_output_instance_passes_through():
    o = Output(answer="x")
    assert normalize_output(o) is o


@pytest.mark.parametrize(
    "value, message",
    [
        (None, "string or a dict"),
        (42, "string or a dict"),
        ({"answer": 3}, "'answer' must be a string"),
        ({"contexts": "doc"}, "'contexts' must be a list"),
        ({"contexts": [{"id": "a"}]}, "string 'text'"),
        ({"contexts": [{"text": "a", "score": "high"}]}, "score must be a number"),
        ({"tool_calls": [{"args": {}}]}, "non-empty string 'name'"),
        ({"tool_calls": [{"name": "t", "args": [1]}]}, "args must be an object"),
        ({"stop_reason": 1}, "'stop_reason'"),
        ({"metadata": []}, "'metadata' must be an object"),
    ],
)
def test_invalid_outputs_raise(value, message):
    with pytest.raises(InvalidOutputError, match=message):
        normalize_output(value)


def test_load_callable_from_file(tmp_path):
    (tmp_path / "wf.py").write_text("def go(x):\n    return x\n")
    assert load_callable("wf.py:go", tmp_path)("ok") == "ok"


def test_load_callable_from_module(tmp_path):
    (tmp_path / "wfmod_unique.py").write_text("class A:\n    @staticmethod\n    def go(x):\n        return 1\n")
    assert load_callable("wfmod_unique:A.go", tmp_path)(None) == 1


@pytest.mark.parametrize(
    "spec, code, message",
    [
        ("nocolon", None, "must look like"),
        ("missing.py:go", None, "not found"),
        ("bad.py:go", "raise RuntimeError('import boom')", "import boom"),
        ("ok.py:nope", "x = 1", "no attribute"),
        ("ok2.py:x", "x = 1", "not callable"),
        ("definitely_not_a_module_xyz:go", None, "Importing module"),
    ],
)
def test_load_callable_errors(tmp_path, spec, code, message):
    if code is not None:
        (tmp_path / spec.split(":")[0]).write_text(code)
    with pytest.raises(TargetError, match=message):
        load_callable(spec, tmp_path)
