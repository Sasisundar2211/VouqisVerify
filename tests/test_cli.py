import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from vouqis_verify.cli import affected_files, changed_files, inline_code, load_config, main, safe_output


def call_main(args):
    with redirect_stdout(StringIO()), redirect_stderr(StringIO()):
        return main(args)


class VouqisVerifyTests(unittest.TestCase):
    def test_report_output_cannot_inject_html_or_ping_users(self):
        output = safe_output("<script>alert('x')</script> @team")
        self.assertNotIn("<script>", output)
        self.assertNotIn("@team", output)
        self.assertIn("&lt;script&gt;", output)
        self.assertEqual(inline_code("a`b"), "`` a`b ``")

    def test_real_git_diff_runs_evaluator_for_deleted_prompt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prompt = root / "prompts" / "system.md"
            prompt.parent.mkdir()
            prompt.write_text("You are helpful.", encoding="utf-8")
            (root / ".vouqis-verify.json").write_text(
                json.dumps({"paths": ["prompts"], "command": [sys.executable, "-c", "print('evaluation passed')"]}),
                encoding="utf-8",
            )
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "add", "."], cwd=root, check=True)
            commit = ["git", "-c", "user.name=Vouqis Test", "-c", "user.email=test@example.invalid", "commit", "-qm"]
            subprocess.run([*commit, "initial"], cwd=root, check=True)
            self.assertIn("prompts/system.md", changed_files(root, "0" * 40, "HEAD"))
            prompt.unlink()
            subprocess.run(["git", "add", "-A"], cwd=root, check=True)
            subprocess.run([*commit, "remove prompt"], cwd=root, check=True)
            self.assertEqual(call_main(["--repo", str(root)]), 0)
            body = (root / "vouqis-verify-report.md").read_text(encoding="utf-8")
            self.assertIn("PASSED", body)
            self.assertIn("prompts/system.md", body)
            self.assertIn("evaluation passed", body)

    def test_matches_directories_and_globs(self):
        files = ["prompts/system.md", "src/ai/pipeline.py", "src/web/page.tsx"]
        self.assertEqual(
            affected_files(files, ("prompts", "src/ai/*.py")),
            ["prompts/system.md", "src/ai/pipeline.py"],
        )

    def test_rejects_shell_string_command(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            path.write_text(json.dumps({"paths": ["prompts"], "command": "pytest"}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "command"):
                load_config(path)

    def test_configuration_error_still_writes_review_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(call_main(["--repo", str(root)]), 2)
            body = (root / "vouqis-verify-report.md").read_text(encoding="utf-8")
            self.assertIn("ERROR", body)
            self.assertIn("could not read", body)

    @patch("vouqis_verify.cli.changed_files", return_value=["src/web/page.tsx"])
    @patch("vouqis_verify.cli.subprocess.run")
    def test_skips_evaluation_without_relevant_changes(self, run, _changed):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "config.json"
            output = root / "report.md"
            config.write_text(json.dumps({"paths": ["prompts"], "command": ["pytest"]}), encoding="utf-8")
            self.assertEqual(call_main(["--repo", str(root), "--config", str(config), "--report", str(output)]), 0)
            run.assert_not_called()
            self.assertIn("SKIPPED", output.read_text(encoding="utf-8"))

    @patch("vouqis_verify.cli.changed_files", return_value=["prompts/system.md"])
    @patch("vouqis_verify.cli.subprocess.run")
    def test_returns_evaluator_failure_and_writes_report(self, run, _changed):
        def fail(command, **kwargs):
            self.assertFalse(kwargs["shell"])
            kwargs["stdout"].write("1 failed\n" + "x" * 30_000)
            return subprocess.CompletedProcess(command, 1)

        run.side_effect = fail
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "config.json"
            output = root / "report.md"
            config.write_text(json.dumps({"paths": ["prompts"], "command": ["pytest"]}), encoding="utf-8")
            self.assertEqual(call_main(["--repo", str(root), "--config", str(config), "--report", str(output)]), 1)
            body = output.read_text(encoding="utf-8")
            self.assertIn("FAILED", body)
            self.assertIn("1 failed", body)
            self.assertIn("output truncated", body)
            self.assertLess(len(body), 21_000)


if __name__ == "__main__":
    unittest.main()
