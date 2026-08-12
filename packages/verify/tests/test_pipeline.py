from unittest.mock import patch

from vouqis_verify.config.schema import Config
from vouqis_verify.core.pipeline import run_verification
from vouqis_verify.core.runner import EvalResult


def _result(passed: bool) -> EvalResult:
    return EvalResult(
        passed=passed,
        exit_code=0 if passed else 1,
        stdout="",
        stderr="",
        duration_ms=100,
        command="pytest",
    )


def _run(changed, passed: bool):
    with (
        patch("vouqis_verify.core.pipeline.detect_ai_changes", return_value=changed),
        patch("vouqis_verify.core.pipeline.run_eval", return_value=_result(passed)),
    ):
        return run_verification(Config(), "main")


def test_ai_changes_are_passed_into_the_report():
    report = _run(["prompts/system.txt"], passed=True)
    assert report.changed_files == ["prompts/system.txt"]


def test_no_ai_changes_stays_distinct_from_diff_failure():
    report = _run([], passed=True)
    assert report.changed_files == []
    assert report.diff_failed is False


def test_git_diff_failure_sets_diff_failed_and_never_yields_safe_to_merge():
    report = _run(None, passed=True)
    assert report.diff_failed is True
    assert report.changed_files == []
    assert report.verdict != "SAFE TO MERGE"


def test_evaluation_failure_is_block_merge():
    report = _run([], passed=False)
    assert report.verdict == "BLOCK MERGE"


def test_evaluation_success_with_ai_changes_is_merge_with_warning():
    report = _run(["prompts/system.txt"], passed=True)
    assert report.verdict == "MERGE WITH WARNING"


def test_evaluation_success_with_no_ai_changes_is_safe_to_merge():
    report = _run([], passed=True)
    assert report.verdict == "SAFE TO MERGE"
