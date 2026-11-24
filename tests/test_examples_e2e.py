"""End-to-end: run the reference RAG pipeline and agent, inject real regressions,
and assert Vouqis Verify flags the right case for the right reason."""

from __future__ import annotations

import pytest

from conftest import EXAMPLES
from vouqis_verify import compare_runs, load_suite, run_suite, verdict
from vouqis_verify.compare import ERROR


@pytest.fixture(scope="module")
def rag():
    suite = load_suite(EXAMPLES / "rag" / "vouqis.yaml")
    return suite, run_suite(suite)


@pytest.fixture(scope="module")
def agent():
    suite = load_suite(EXAMPLES / "agent" / "vouqis.yaml")
    return suite, run_suite(suite)


def regress(suite, baseline, **overrides):
    current = run_suite(suite, target_overrides=overrides)
    comparison = compare_runs(baseline, current, suite.compare)
    failed = {c.id for c in current.cases if not c.passed}
    error_cases = {(f.category, f.case_id) for f in comparison.findings if f.severity == ERROR}
    return current, comparison, failed, error_cases


def test_rag_baseline_is_green(rag):
    suite, baseline = rag
    assert baseline.passed, [c.id for c in baseline.cases if not c.passed]
    assert verdict(baseline, compare_runs(baseline, baseline, suite.compare)).passed


def test_rag_top_k_regression_breaks_multi_document_answer(rag):
    suite, baseline = rag
    current, _, failed, errors = regress(suite, baseline, top_k=1)
    assert failed == {"warranty-water-damage-and-replacement"}
    assert ("metric", "warranty-water-damage-and-replacement") in errors
    metrics = current.case("warranty-water-damage-and-replacement").metrics()
    assert metrics["retrieval_recall.recall"] == 0.5


def test_rag_access_filter_regression_is_a_tenant_leak(rag):
    suite, baseline = rag
    _, _, failed, errors = regress(suite, baseline, apply_access_filter=False)
    assert failed == {"tenant-isolation-globex"}
    assert ("status", "tenant-isolation-globex") in errors


def test_rag_context_budget_regression_truncates_facts(rag):
    suite, baseline = rag
    current, _, failed, _ = regress(suite, baseline, max_context_chars=60)
    assert "warranty-water-damage-and-replacement" in failed
    assert current.case("refund-window").primary.output.metadata["context_truncated"] is True


def test_rag_ungrounded_generator_is_caught_by_groundedness(rag):
    suite, baseline = rag
    current, _, failed, errors = regress(suite, baseline, generator="freeform")
    assert "refund-window" in failed
    assert ("metric", "refund-window") in errors
    assert current.case("refund-window").metrics()["groundedness.score"] == 0.0


def test_rag_unanswerable_question_abstains(rag):
    # Regression: possessive fragments ("CEO's" -> "s") matched unrelated docs.
    _, baseline = rag
    case = baseline.case("unanswerable-abstains")
    assert case.passed and case.primary.output.contexts == []


def test_agent_baseline_is_green(agent):
    _, baseline = agent
    assert baseline.passed, [c.id for c in baseline.cases if not c.passed]


@pytest.mark.parametrize(
    "overrides, expected_failed",
    [
        ({"skip_eligibility_check": True}, {"refund-eligible-order", "refund-outside-window"}),
        ({"swallow_tool_errors": True}, {"unknown-order-not-refunded"}),
        ({"max_retries": 0}, {"shipping-transient-failure-retried"}),
        ({"max_steps": 2}, {"refund-eligible-order"}),
    ],
)
def test_agent_regressions(agent, overrides, expected_failed):
    suite, baseline = agent
    _, comparison, failed, errors = regress(suite, baseline, **overrides)
    assert failed == expected_failed
    assert {cid for cat, cid in errors if cat == "status"} == expected_failed
    assert any(f.category == "drift" for f in comparison.findings)


def test_agent_silent_failure_detail(agent):
    suite, baseline = agent
    current, _, _, _ = regress(suite, baseline, swallow_tool_errors=True)
    case = current.case("unknown-order-not-refunded")
    out = case.primary.output
    # The workflow "succeeded" (final answer, no exception) but every tool failed.
    assert out.stop_reason == "final_answer"
    assert all(t.error for t in out.tool_calls)
    failed = {c.name for c in case.primary.checks if not c.passed}
    assert {"tool_not_called", "not_contains"} <= failed
