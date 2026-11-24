"""Exercise the installed CLI as a subprocess, the way CI calls it."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

from conftest import EXAMPLES

AGENT = str(EXAMPLES / "agent" / "vouqis.yaml")


def vouqis(*args: str, env: dict = None, cwd: Path = None) -> subprocess.CompletedProcess:
    full_env = {**os.environ, "GITHUB_ACTIONS": "", **(env or {})}
    return subprocess.run(
        [sys.executable, "-m", "vouqis_verify", *args],
        capture_output=True,
        text=True,
        env=full_env,
        cwd=cwd,
        timeout=120,
    )


def test_version_and_help():
    out = vouqis("--version")
    assert out.returncode == 0 and "vouqis-verify" in out.stdout
    assert vouqis("--help").returncode == 0
    assert vouqis().returncode == 2  # no subcommand


def test_checks_lists_registry():
    out = vouqis("checks")
    assert out.returncode == 0
    assert "groundedness" in out.stdout and "heuristic" in out.stdout


def test_validate():
    out = vouqis("validate", AGENT)
    assert out.returncode == 0 and "6 case(s)" in out.stdout


def test_run_pass_then_regression_exit_codes(tmp_path):
    baseline = tmp_path / "base.json"
    first = vouqis("run", AGENT, "--save-baseline", str(baseline), "-q")
    assert first.returncode == 0, first.stdout + first.stderr
    assert "RESULT: PASSED" in first.stdout

    md, junit, out_json = tmp_path / "r.md", tmp_path / "r.xml", tmp_path / "run.json"
    second = vouqis(
        "run",
        AGENT,
        "--baseline",
        str(baseline),
        "-T",
        "swallow_tool_errors=true",
        "--markdown",
        str(md),
        "--junit",
        str(junit),
        "--output",
        str(out_json),
        "-q",
    )
    assert second.returncode == 1, second.stdout
    assert "unknown-order-not-refunded" in second.stdout
    assert "(Failed)" in md.read_text()
    assert ET.parse(junit).getroot().get("failures") == "1"
    assert json.loads(out_json.read_text())["summary"]["failed"] == 1


def test_json_format_is_parseable(tmp_path):
    out = vouqis("run", AGENT, "--format", "json", "--case", "shipping-status")
    assert out.returncode == 0
    payload = json.loads(out.stdout)
    assert payload["passed"] is True and payload["run"]["summary"]["cases"] == 1


def test_compare_command(tmp_path):
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    assert vouqis("run", AGENT, "--output", str(a), "-q").returncode == 0
    assert vouqis("run", AGENT, "--output", str(b), "-q", "-T", "skip_eligibility_check=true").returncode == 1
    assert vouqis("compare", str(a), str(b), "--suite", AGENT).returncode == 1
    assert vouqis("compare", str(a), str(a)).returncode == 0


@pytest.mark.parametrize(
    "args",
    [
        ["run", "missing.yaml"],
        ["run", AGENT, "--baseline", "nope.json"],
        ["run", AGENT, "-T", "novalue"],
        ["run", AGENT, "--case", "does-not-exist"],
        ["compare", "nope.json", "nope2.json"],
    ],
)
def test_usage_errors_exit_2(args, tmp_path):
    out = vouqis(*args, cwd=tmp_path)
    assert out.returncode == 2, out.stdout + out.stderr
    assert "vouqis: error:" in out.stderr
    assert "Traceback" not in out.stderr


def test_corrupt_baseline_exits_2(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text("{not json")
    out = vouqis("run", AGENT, "--baseline", str(bad))
    assert out.returncode == 2 and "not valid JSON" in out.stderr


def test_github_step_summary(tmp_path):
    summary = tmp_path / "summary.md"
    env = {"GITHUB_ACTIONS": "true", "GITHUB_STEP_SUMMARY": str(summary)}
    assert vouqis("run", AGENT, "-q", env=env).returncode == 0
    assert "## Vouqis Verify: support-agent (Passed)" in summary.read_text()
    summary.unlink()
    assert vouqis("run", AGENT, "-q", "--no-github-summary", env=env).returncode == 0
    assert not summary.exists()


def test_init_scaffolds_valid_suites(tmp_path):
    for kind in ("rag", "agent"):
        target = tmp_path / kind
        out = vouqis("init", str(target), "--template", kind)
        assert out.returncode == 0, out.stderr
        assert vouqis("validate", str(target / "vouqis.yaml")).returncode == 0
        run = vouqis("run", str(target / "vouqis.yaml"), "-q")
        assert run.returncode == 1 and "NotImplementedError" in run.stdout  # never a fake pass
    again = vouqis("init", str(tmp_path / "rag"))
    assert again.returncode == 2 and "Refusing to overwrite" in again.stderr
    assert vouqis("init", str(tmp_path / "rag"), "--force").returncode == 0


def test_workers_flag(tmp_path):
    assert vouqis("run", AGENT, "-q", "-j", "4").returncode == 0
    bad = vouqis("run", AGENT, "-q", "-j", "0")
    assert bad.returncode == 2 and "workers" in bad.stderr
