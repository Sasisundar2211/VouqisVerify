from unittest.mock import patch

from vouqis_verify.core.diff import _matches_any, detect_ai_changes


def _mock_diff(changed: list[str]):
    """Return a patch that makes git diff produce the given file list."""
    output = "\n".join(changed)

    class FakeResult:
        returncode = 0
        stdout = output

    return patch("vouqis_verify.core.diff.subprocess.run", return_value=FakeResult())


def test_filters_to_ai_paths():
    with _mock_diff(["prompts/system.txt", "src/app/main.py"]):
        result = detect_ai_changes(["prompts/"], "main")
    assert result == ["prompts/system.txt"]


def test_empty_when_no_ai_files_changed():
    with _mock_diff(["src/app/main.py", "README.md"]):
        result = detect_ai_changes(["prompts/", "src/agents/"], "main")
    assert result == []


def test_multiple_ai_paths_matched():
    with _mock_diff(["prompts/system.txt", "src/agents/chat.py", "tests/test_main.py"]):
        result = detect_ai_changes(["prompts/", "src/agents/"], "main")
    assert "prompts/system.txt" in result
    assert "src/agents/chat.py" in result
    assert "tests/test_main.py" not in result


def test_matches_any_with_trailing_slash():
    assert _matches_any("prompts/system.txt", ["prompts/"]) is True


def test_matches_any_without_trailing_slash():
    assert _matches_any("prompts/system.txt", ["prompts"]) is True


def test_no_match():
    assert _matches_any("src/main.py", ["prompts/", "agents/"]) is False


def test_returns_none_when_git_diff_fails():
    """A failed git diff (e.g. shallow clone missing the baseline) must be
    distinguishable from a successful diff that found zero AI files changed —
    otherwise verify() silently reports SAFE TO MERGE with no real basis."""

    class FailResult:
        returncode = 1
        stdout = ""

    with patch("vouqis_verify.core.diff.subprocess.run", return_value=FailResult()):
        result = detect_ai_changes(["prompts/"], "main")
    assert result is None


def test_returns_list_not_none_on_successful_empty_diff():
    with _mock_diff([]):
        result = detect_ai_changes(["prompts/"], "main")
    assert result == []
    assert result is not None
