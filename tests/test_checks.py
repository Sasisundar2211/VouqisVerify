from __future__ import annotations

import json

import pytest

from vouqis_verify.checks import REGISTRY, CheckContext, check_names, run_checks
from vouqis_verify.models import HEURISTIC, Output
from vouqis_verify.target import normalize_output

CTX = CheckContext(latency_ms=12.0)


def run1(params, out):
    if not isinstance(out, Output):
        out = normalize_output(out)
    return run_checks([params], out, CTX)[0]


RAG = {
    "answer": "Refunds are allowed within 30 days of delivery.",
    "contexts": [
        {"id": "refund", "text": "Customers can request a refund within 30 days of delivery."},
        {"id": "shipping", "text": "Shipping takes 3 to 5 days."},
        {"id": "warranty", "text": "One year warranty."},
    ],
}

AGENT = {
    "answer": "done",
    "stop_reason": "final_answer",
    "tool_calls": [
        {"name": "lookup", "args": {"id": "A", "opts": {"deep": True}}},
        {"name": "check", "args": {"id": "A"}},
        {"name": "refund", "args": {"id": "A", "amount": None}, "error": "declined"},
    ],
}

CASES = [
    # (params, output, expected_pass)
    ({"type": "answer_present"}, "x", True),
    ({"type": "answer_present"}, "   ", False),
    ({"type": "answer_present"}, {"answer": None}, False),
    ({"type": "contains", "value": ["HELLO", "world"]}, "hello world", True),
    ({"type": "contains", "value": "HELLO", "case_sensitive": True}, "hello", False),
    ({"type": "not_contains", "value": ["secret"]}, "all clear", True),
    ({"type": "not_contains", "value": "Secret"}, "the secret is", False),
    ({"type": "equals", "value": "ok"}, "  ok \n", True),
    ({"type": "equals", "value": "OK"}, "ok", False),
    ({"type": "equals", "value": "OK", "case_sensitive": False}, "ok", True),
    ({"type": "regex", "pattern": r"ORD-\d+"}, "see ORD-12", True),
    ({"type": "regex", "pattern": r"ord-\d+", "ignore_case": True}, "see ORD-12", True),
    ({"type": "regex", "pattern": r"\d{3}-\d{4}", "must_match": False}, "call 555-1234", False),
    ({"type": "json_valid", "required_keys": ["a"]}, json.dumps({"a": 1}), True),
    ({"type": "json_valid", "required_keys": ["b"]}, json.dumps({"a": 1}), False),
    ({"type": "json_valid", "required_keys": ["a"]}, "[1]", False),
    ({"type": "json_valid"}, "not json", False),
    ({"type": "answer_length", "min": 2, "max": 3}, "abc", True),
    ({"type": "answer_length", "max": 2}, "abc", False),
    ({"type": "answer_length", "min": 4}, "abc", False),
    ({"type": "max_latency_ms", "value": 12}, "x", True),
    ({"type": "max_latency_ms", "value": 11}, "x", False),
    ({"type": "metadata_equals", "key": "k", "value": 1}, {"answer": "x", "metadata": {"k": 1}}, True),
    ({"type": "metadata_equals", "key": "k", "value": 2}, {"answer": "x", "metadata": {"k": 1}}, False),
    ({"type": "metadata_equals", "key": "z", "value": 1}, {"answer": "x"}, False),
    # RAG
    ({"type": "min_contexts", "value": 3}, RAG, True),
    ({"type": "min_contexts", "value": 4}, RAG, False),
    ({"type": "retrieval_recall", "expected_ids": ["refund", "warranty"]}, RAG, True),
    ({"type": "retrieval_recall", "expected_ids": ["refund", "warranty"], "k": 2}, RAG, False),
    ({"type": "retrieval_recall", "expected_ids": ["refund", "warranty"], "k": 2, "min": 0.5}, RAG, True),
    ({"type": "retrieval_recall", "expected_ids": "x"}, {"contexts": [{"text": "no id"}]}, False),
    ({"type": "retrieval_precision", "expected_ids": ["refund"], "k": 1, "min": 1.0}, RAG, True),
    ({"type": "retrieval_precision", "expected_ids": ["refund"], "min": 0.5}, RAG, False),
    ({"type": "retrieval_precision", "expected_ids": ["refund"], "min": 0.1}, {"contexts": []}, False),
    ({"type": "retrieval_mrr", "expected_ids": ["shipping"], "min": 0.5}, RAG, True),
    ({"type": "retrieval_mrr", "expected_ids": ["warranty"], "min": 0.5}, RAG, False),
    ({"type": "context_excludes_ids", "ids": ["secret"]}, RAG, True),
    ({"type": "context_excludes_ids", "ids": "shipping"}, RAG, False),
    ({"type": "context_contains", "value": ["30 days", "3 TO 5"]}, RAG, True),
    ({"type": "context_contains", "value": "15 minutes"}, RAG, False),
    ({"type": "max_context_chars", "value": 1000}, RAG, True),
    ({"type": "max_context_chars", "value": 10}, RAG, False),
    ({"type": "groundedness", "min": 1.0}, RAG, True),
    (
        {"type": "groundedness", "min": 0.5},
        {**RAG, "answer": "Refunds are allowed within 30 days. Our CEO loves purple elephants."},
        True,
    ),
    (
        {"type": "groundedness", "min": 0.9},
        {**RAG, "answer": "Refunds are allowed within 30 days. Our CEO loves purple elephants."},
        False,
    ),
    ({"type": "groundedness"}, {"answer": "", "contexts": []}, False),
    ({"type": "groundedness"}, {"answer": "Refunds within 30 days.", "contexts": []}, False),
    # Agent
    ({"type": "tool_called", "tool": "lookup"}, AGENT, True),
    ({"type": "tool_called", "tool": "lookup", "min_times": 2}, AGENT, False),
    ({"type": "tool_called", "tool": "lookup", "max_times": 0, "min_times": 0}, AGENT, False),
    ({"type": "tool_not_called", "tool": "delete"}, AGENT, True),
    ({"type": "tool_not_called", "tool": "refund"}, AGENT, False),
    ({"type": "tool_sequence", "sequence": ["lookup", "refund"]}, AGENT, True),
    ({"type": "tool_sequence", "sequence": ["refund", "lookup"]}, AGENT, False),
    ({"type": "tool_sequence", "sequence": ["lookup", "refund"], "exact": True}, AGENT, False),
    ({"type": "tool_sequence", "sequence": ["lookup", "check", "refund"], "exact": True}, AGENT, True),
    ({"type": "tool_args", "tool": "lookup", "args": {"opts": {"deep": True}}}, AGENT, True),
    ({"type": "tool_args", "tool": "lookup", "args": {"id": "B"}}, AGENT, False),
    ({"type": "tool_args", "tool": "nope", "args": {}}, AGENT, False),
    ({"type": "tool_args_required", "tool": "lookup", "keys": ["id"]}, AGENT, True),
    ({"type": "tool_args_required", "tool": "refund", "keys": ["id", "amount"]}, AGENT, False),
    ({"type": "no_tool_errors"}, AGENT, False),
    ({"type": "no_tool_errors", "allow": ["refund"]}, AGENT, True),
    ({"type": "max_tool_calls", "value": 3}, AGENT, True),
    ({"type": "max_tool_calls", "value": 2}, AGENT, False),
    ({"type": "max_repeated_calls", "value": 1}, AGENT, True),
    ({"type": "max_repeated_calls", "value": 2}, {"tool_calls": [{"name": "s", "args": {"q": 1}}] * 3}, False),
    (
        {"type": "max_repeated_calls", "value": 1},
        {"tool_calls": [{"name": "s", "args": {"q": 1}}, {"name": "s", "args": {"q": 2}}]},
        True,
    ),
    ({"type": "stop_reason", "value": "final_answer"}, AGENT, True),
    ({"type": "stop_reason", "value": ["max_steps"]}, AGENT, False),
]


@pytest.mark.parametrize("params, output, expected", CASES)
def test_check_outcome(params, output, expected):
    result = run1(params, output)
    assert result.passed is expected, result.message
    assert result.message


def test_every_registered_check_has_a_test_case():
    covered = {p["type"] for p, _, _ in CASES}
    assert covered == set(REGISTRY), set(REGISTRY) - covered


def test_metrics_are_reported():
    assert run1({"type": "retrieval_recall", "expected_ids": ["refund", "x"]}, RAG).metrics == {"recall": 0.5}
    assert run1({"type": "retrieval_mrr", "expected_ids": ["warranty"]}, RAG).metrics == {"mrr": pytest.approx(1 / 3)}


def test_groundedness_is_labeled_heuristic():
    assert run1({"type": "groundedness"}, RAG).kind == HEURISTIC
    assert run1({"type": "contains", "value": "x"}, "x").kind != HEURISTIC


def test_raising_check_fails_instead_of_passing(monkeypatch):
    spec = REGISTRY["answer_present"]

    def boom(*_):
        raise RuntimeError("bug")

    monkeypatch.setitem(REGISTRY, "answer_present", spec.__class__(**{**spec.__dict__, "fn": boom}))
    result = run1({"type": "answer_present"}, "x")
    assert not result.passed and "RuntimeError" in result.message


def test_check_names_are_unique_and_stable():
    names = check_names([{"type": "contains"}, {"type": "contains"}, {"type": "x", "name": "custom"}])
    assert names == ["contains", "contains#2", "custom"]


def test_tool_param_does_not_rename_check():
    # Regression: agent checks used `name` for the tool, which collided with the
    # check-name override, so results and metrics were keyed by the tool name.
    result = run1({"type": "tool_called", "tool": "lookup"}, AGENT)
    assert result.name == "tool_called"
