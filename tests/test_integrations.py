"""Framework integrations. Skipped unless the framework is installed; the
`integrations` CI job installs it."""

from __future__ import annotations

import pytest

from conftest import EXAMPLES
from vouqis_verify import compare_runs, load_suite, run_suite

pytest.importorskip("langchain_core")


def test_langchain_example_passes_and_detects_regression():
    suite = load_suite(EXAMPLES / "langchain" / "vouqis.yaml")
    baseline = run_suite(suite)
    assert baseline.passed, [c.id for c in baseline.cases if not c.passed]
    ctx = baseline.case("refund-window").primary.output.contexts
    assert ctx[0].id == "refund-policy"  # Document.metadata["source"] mapped to the context id

    broken = run_suite(suite, target_overrides={"k": 0})
    comparison = compare_runs(baseline, broken, suite.compare)
    assert {c.id for c in broken.cases if not c.passed} == {"refund-window", "shipping-time"}
    assert any(f.category == "metric" and "recall" in f.message for f in comparison.errors)
