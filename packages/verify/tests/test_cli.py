import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

from typer.testing import CliRunner

from vouqis_verify.cli import app
from vouqis_verify.core.runner import EvalResult

runner = CliRunner()


def _result(passed: bool) -> EvalResult:
    return EvalResult(
        passed=passed,
        exit_code=0 if passed else 1,
        stdout="3 passed" if passed else "FAILED",
        stderr="",
        duration_ms=500,
        command="pytest",
    )


def _verify(extra_args: list[str] = (), passed: bool = True, changed: list[str] | None = None):
    with (
        patch("vouqis_verify.cli.detect_ai_changes", return_value=changed or []),
        patch("vouqis_verify.cli.run_eval", return_value=_result(passed)),
        patch("vouqis_verify.cli.post_pr_comment"),
    ):
        return runner.invoke(app, ["verify", "--no-comment", *extra_args])


# ── exit codes ────────────────────────────────────────────────────────────────


def test_verify_exits_0_on_pass():
    assert _verify(passed=True).exit_code == 0


def test_verify_exits_1_on_failure():
    assert _verify(passed=False).exit_code == 1


# ── output ────────────────────────────────────────────────────────────────────


def test_verify_prints_verdict():
    result = _verify(passed=True)
    assert "SAFE TO MERGE" in result.output


def test_verify_prints_warning_when_ai_files_changed():
    result = _verify(passed=True, changed=["prompts/system.md"])
    assert "MERGE WITH WARNING" in result.output


def test_verify_json_flag_includes_verdict_key():
    result = _verify(extra_args=["--json"], passed=True)
    assert result.exit_code == 0
    assert '"verdict"' in result.output


def test_verify_json_flag_exits_1_on_failure():
    result = _verify(extra_args=["--json"], passed=False)
    assert result.exit_code == 1


def test_verify_json_stdout_is_clean_parseable_json():
    """--json is documented as stdout output "for integrations" — progress
    lines must not be interleaved with it on the same stream."""
    result = _verify(extra_args=["--json"], passed=True, changed=["prompts/system.md"])
    parsed = json.loads(result.stdout)
    assert parsed["verdict"] == "MERGE WITH WARNING"


def test_verify_warns_when_config_file_missing():
    with (
        tempfile.TemporaryDirectory() as d,
        patch("vouqis_verify.cli.detect_ai_changes", return_value=[]),
        patch("vouqis_verify.cli.run_eval", return_value=_result(True)),
        patch("vouqis_verify.cli.post_pr_comment"),
    ):
        missing = Path(d) / "vouqis.yml"
        result = runner.invoke(app, ["verify", "--no-comment", "--config", str(missing)])
    assert "not found" in result.output
    assert "vouqis init" in result.output


def test_verify_warns_and_downgrades_when_diff_detection_fails():
    with (
        patch("vouqis_verify.cli.detect_ai_changes", return_value=None),
        patch("vouqis_verify.cli.run_eval", return_value=_result(True)),
        patch("vouqis_verify.cli.post_pr_comment"),
    ):
        result = runner.invoke(app, ["verify", "--no-comment"])
    assert "SAFE TO MERGE" not in result.output
    assert "MERGE WITH WARNING" in result.output


# ── PR comment wiring ─────────────────────────────────────────────────────────


def test_verify_posts_comment_when_all_env_set():
    mock_comment = MagicMock()
    with (
        patch("vouqis_verify.cli.detect_ai_changes", return_value=[]),
        patch("vouqis_verify.cli.run_eval", return_value=_result(True)),
        patch("vouqis_verify.cli.post_pr_comment", mock_comment),
    ):
        runner.invoke(app, ["verify", "--pr", "42", "--repo", "owner/repo", "--token", "tok"])
    mock_comment.assert_called_once()


def test_verify_skips_comment_with_no_comment_flag():
    mock_comment = MagicMock()
    with (
        patch("vouqis_verify.cli.detect_ai_changes", return_value=[]),
        patch("vouqis_verify.cli.run_eval", return_value=_result(True)),
        patch("vouqis_verify.cli.post_pr_comment", mock_comment),
    ):
        runner.invoke(
            app, ["verify", "--no-comment", "--pr", "42", "--repo", "owner/repo", "--token", "tok"]
        )
    mock_comment.assert_not_called()


# ── init command ──────────────────────────────────────────────────────────────


def test_init_creates_config_file():
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "vouqis.yml"
        result = runner.invoke(app, ["init", "--config", str(path)])
        assert result.exit_code == 0
        assert path.exists()


def test_init_fails_when_config_already_exists():
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "vouqis.yml"
        path.write_text("existing")
        result = runner.invoke(app, ["init", "--config", str(path)])
        assert result.exit_code == 1
