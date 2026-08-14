import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

from vouqis_verify.core.diagnostics import run_doctor


def _mock_git(returncode: int = 0):
    m = MagicMock()
    m.returncode = returncode
    return patch("vouqis_verify.core.diagnostics.subprocess.run", return_value=m)


def test_ok_when_config_valid_and_git_present():
    with tempfile.TemporaryDirectory() as d:
        config = Path(d) / "vouqis.yml"
        config.write_text("eval_command: pytest\n")
        with _mock_git(0):
            result = run_doctor(config)
    assert result.ok is True


def test_config_missing_is_not_ok():
    with _mock_git(0):
        result = run_doctor(Path("/nonexistent/vouqis.yml"))
    assert result.config_exists is False
    assert result.ok is False


def test_config_invalid_reports_error_message():
    with tempfile.TemporaryDirectory() as d:
        config = Path(d) / "vouqis.yml"
        config.write_text("timeout_seconds: 0", encoding="utf-8")
        with _mock_git(0):
            result = run_doctor(config)
    assert result.config_exists is True
    assert result.config_ok is False
    assert result.config_error is not None
    assert result.ok is False


def test_not_in_git_repo_is_not_ok():
    with tempfile.TemporaryDirectory() as d:
        config = Path(d) / "vouqis.yml"
        config.write_text("eval_command: pytest\n")
        with _mock_git(1):
            result = run_doctor(config)
    assert result.git_ok is False
    assert result.ok is False


def test_missing_git_executable_does_not_raise():
    with tempfile.TemporaryDirectory() as d:
        config = Path(d) / "vouqis.yml"
        config.write_text("eval_command: pytest\n")
        with patch(
            "vouqis_verify.core.diagnostics.subprocess.run",
            side_effect=FileNotFoundError("git"),
        ):
            result = run_doctor(config)
    assert result.git_ok is False
    assert result.git_error is not None
    assert "not found" in result.git_error


def test_env_vars_reported():
    with tempfile.TemporaryDirectory() as d:
        config = Path(d) / "vouqis.yml"
        config.write_text("eval_command: pytest\n")
        with _mock_git(0):
            result = run_doctor(config)
    assert set(result.env_vars) == {"GITHUB_TOKEN", "GITHUB_REPOSITORY", "PR_NUMBER"}
