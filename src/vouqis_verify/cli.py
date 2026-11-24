"""Command-line interface: ``vouqis run | compare | validate | checks``.

Exit codes: 0 verification passed, 1 verification failed, 2 usage or configuration error.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import __version__
from .checks import REGISTRY
from .compare import Comparison, compare_runs, verdict
from .config import COMPARE_CATEGORIES, CompareConfig, load_suite
from .errors import VouqisError
from .models import CaseResult, RunResult
from .report import load_run, save_run, to_json, to_junit, to_markdown, to_text
from .runner import run_suite
from .scaffold import TEMPLATES, init_project
from .target import load_callable

EXIT_OK, EXIT_FAILED, EXIT_USAGE = 0, 1, 2


def _parse_target_args(pairs: List[str]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for pair in pairs:
        key, sep, raw = pair.partition("=")
        if not sep or not key:
            raise VouqisError(f"--target-arg expects key=value, got {pair!r}")
        try:
            out[key] = json.loads(raw)
        except ValueError:
            out[key] = raw
    return out


def _write(path: Optional[str], text: str) -> None:
    if path:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")


def _github_summary(markdown: str, enabled: bool) -> None:
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if enabled and summary and os.environ.get("GITHUB_ACTIONS") == "true":
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(markdown + "\n")


def _emit(
    run: RunResult,
    comparison: Optional[Comparison],
    args: argparse.Namespace,
    baseline: Optional[RunResult],
    allow_known: bool,
) -> int:
    v = verdict(
        run, comparison, allow_known_failures=allow_known, fail_on_warnings=args.fail_on_warnings, baseline=baseline
    )
    markdown = to_markdown(run, comparison, v)
    if args.format == "json":
        sys.stdout.write(to_json(run, comparison, v) + "\n")
    else:
        sys.stdout.write(to_text(run, comparison, v, verbose=args.verbose))
    _write(args.markdown, markdown)
    _write(args.junit, to_junit(run, comparison))
    _github_summary(markdown, not args.no_github_summary)
    return EXIT_OK if v.passed else EXIT_FAILED


def cmd_run(args: argparse.Namespace) -> int:
    suite = load_suite(args.suite)
    baseline = None
    if args.baseline:
        bpath = Path(args.baseline)
        if not bpath.is_file():
            raise VouqisError(f"Baseline not found: {bpath}. Create one with --save-baseline {bpath}.")
        baseline = load_run(bpath)

    def progress(case: CaseResult) -> None:
        if args.format == "text" and not args.quiet:
            sys.stderr.write(f"  {'.' if case.passed else 'F'} {case.id}\n")

    run = run_suite(
        suite,
        target_overrides=_parse_target_args(args.target_arg),
        case_ids=args.case,
        progress=progress,
        workers=args.workers,
    )
    if args.output:
        save_run(run, args.output)
    if args.save_baseline:
        save_run(run, args.save_baseline)
        sys.stderr.write(f"Saved baseline to {args.save_baseline}\n")

    comparison = compare_runs(baseline, run, suite.compare) if baseline else None
    allow_known = args.allow_known_failures or suite.compare.allow_known_failures
    return _emit(run, comparison, args, baseline, allow_known)


def cmd_compare(args: argparse.Namespace) -> int:
    cfg = load_suite(args.suite).compare if args.suite else CompareConfig()
    if args.fail_on is not None:
        cfg.fail_on = args.fail_on
    baseline, current = load_run(args.baseline), load_run(args.current)
    comparison = compare_runs(baseline, current, cfg)
    return _emit(current, comparison, args, baseline, args.allow_known_failures or cfg.allow_known_failures)


def cmd_validate(args: argparse.Namespace) -> int:
    suite = load_suite(args.suite)
    load_callable(suite.target.callable, suite.base_dir)
    n_checks = sum(len(c.checks) for c in suite.cases)
    print(f"OK: suite {suite.name!r}, {len(suite.cases)} case(s), {n_checks} check(s), target {suite.target.callable}")
    return EXIT_OK


def cmd_init(args: argparse.Namespace) -> int:
    for path in init_project(Path(args.directory), args.template, force=args.force):
        print(f"wrote {path}")
    suite = Path(args.directory) / "vouqis.yaml"
    print(f"Next: edit vouqis_target.py, then run `vouqis run {suite} --save-baseline vouqis-baseline.json`")
    return EXIT_OK


def cmd_checks(args: argparse.Namespace) -> int:
    for name in sorted(REGISTRY):
        spec = REGISTRY[name]
        params = [*sorted(spec.required), *(f"[{o}]" for o in sorted(spec.optional))]
        print(f"{name:22} {spec.kind:13} {' '.join(params)}")
        print(f"{'':22} {spec.description}")
    return EXIT_OK


def _add_output_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--format", choices=["text", "json"], default="text", help="stdout format (default text)")
    p.add_argument("--markdown", metavar="PATH", help="write a Markdown report")
    p.add_argument("--junit", metavar="PATH", help="write a JUnit XML report")
    p.add_argument("--fail-on-warnings", action="store_true", help="treat comparison warnings as failures")
    p.add_argument(
        "--allow-known-failures", action="store_true", help="do not fail on cases that also failed in the baseline"
    )
    p.add_argument(
        "--no-github-summary",
        action="store_true",
        help="do not append the Markdown report to $GITHUB_STEP_SUMMARY in GitHub Actions",
    )
    p.add_argument("-v", "--verbose", action="store_true", help="show passing checks too")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="vouqis", description="Verify RAG and agent workflows against a baseline.")
    parser.add_argument("--version", action="version", version=f"vouqis-verify {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="run a suite, optionally compare with a baseline")
    run.add_argument("suite", help="suite file (.yaml, .yml, or .json)")
    run.add_argument("--baseline", metavar="PATH", help="baseline run JSON to compare against")
    run.add_argument("--save-baseline", metavar="PATH", help="write this run as a baseline")
    run.add_argument("--output", metavar="PATH", help="write this run's full results as JSON")
    run.add_argument(
        "-T",
        "--target-arg",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help="override a target kwarg; VALUE is parsed as JSON when possible",
    )
    run.add_argument("--case", action="append", metavar="ID", help="run only this case (repeatable)")
    run.add_argument("-q", "--quiet", action="store_true", help="no per-case progress on stderr")
    run.add_argument(
        "-j",
        "--workers",
        type=int,
        default=1,
        metavar="N",
        help="run N cases concurrently (target must be thread-safe; default 1)",
    )
    _add_output_args(run)
    run.set_defaults(func=cmd_run)

    cmp_ = sub.add_parser("compare", help="compare two saved run files")
    cmp_.add_argument("baseline")
    cmp_.add_argument("current")
    cmp_.add_argument("--suite", help="read compare settings from this suite file")
    cmp_.add_argument(
        "--fail-on",
        nargs="*",
        choices=COMPARE_CATEGORIES,
        default=None,
        help="categories that fail the comparison (default: status metric)",
    )
    _add_output_args(cmp_)
    cmp_.set_defaults(func=cmd_compare)

    val = sub.add_parser("validate", help="check a suite file and import its target without running it")
    val.add_argument("suite")
    val.set_defaults(func=cmd_validate)

    ini = sub.add_parser("init", help="write a starter suite and target file")
    ini.add_argument("directory", nargs="?", default=".", help="where to write (default: current directory)")
    ini.add_argument("--template", choices=sorted(TEMPLATES), default="rag", help="starter type (default rag)")
    ini.add_argument("--force", action="store_true", help="overwrite existing files")
    ini.set_defaults(func=cmd_init)

    chk = sub.add_parser("checks", help="list available check types")
    chk.set_defaults(func=cmd_checks)
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except VouqisError as exc:
        sys.stderr.write(f"vouqis: error: {exc}\n")
        return EXIT_USAGE
    except (FileNotFoundError, ValueError) as exc:
        sys.stderr.write(f"vouqis: error: {exc}\n")
        return EXIT_USAGE
