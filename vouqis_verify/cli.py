from __future__ import annotations

import argparse
import fnmatch
import html
import json
import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from . import __version__


@dataclass(frozen=True)
class Config:
    paths: tuple[str, ...]
    command: tuple[str, ...]


def load_config(path: Path) -> Config:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"could not read {path}: {error}") from error

    paths = raw.get("paths") if isinstance(raw, dict) else None
    command = raw.get("command") if isinstance(raw, dict) else None
    if not isinstance(paths, list) or not paths or not all(isinstance(item, str) and item.strip() for item in paths):
        raise ValueError("config 'paths' must be a non-empty array of strings")
    if not isinstance(command, list) or not command or not all(
        isinstance(item, str) and item for item in command
    ):
        raise ValueError("config 'command' must be a non-empty array of strings")
    return Config(tuple(paths), tuple(command))


def changed_files(repo: Path, base: str, head: str) -> list[str]:
    if base.startswith("-") or head.startswith("-"):
        raise ValueError("Git refs cannot start with '-'")
    result = subprocess.run(
        ["git", "diff", "--name-only", "--no-renames", "-z", f"{base}...{head}", "--"],
        cwd=repo,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "git diff failed")
    return [file.replace("\\", "/") for file in result.stdout.split("\0") if file]


def affected_files(files: list[str], patterns: tuple[str, ...]) -> list[str]:
    def matches(file: str, pattern: str) -> bool:
        normalized = pattern.strip().replace("\\", "/").removeprefix("./")
        if any(char in normalized for char in "*?["):
            return fnmatch.fnmatchcase(file, normalized)
        prefix = normalized.rstrip("/")
        return file == prefix or file.startswith(f"{prefix}/")

    return [file for file in files if any(matches(file, pattern) for pattern in patterns)]


def safe_output(value: str, limit: int = 20_000) -> str:
    if len(value) > limit:
        half = limit // 2
        value = f"{value[:half]}\n\n... output truncated by Vouqis Verify ...\n\n{value[-half:]}"
    return html.escape(value).replace("@", "&#64;")


def report(status: str, files: list[str], command: tuple[str, ...], output: str = "") -> str:
    visible_files = files[:200]
    file_lines = "\n".join(f"- <code>{safe_output(file)}</code>" for file in visible_files) or "- None"
    if len(files) > len(visible_files):
        file_lines += f"\n- ... and {len(files) - len(visible_files)} more"
    details = ""
    if output:
        details = f"\n<details><summary>Evaluation output</summary>\n\n<pre>{safe_output(output)}</pre>\n</details>\n"
    command_line = f"**Evaluation command:** <code>{safe_output(shlex.join(command))}</code>\n" if command else ""
    return (
        "<!-- vouqis-verify-report -->\n"
        f"## Vouqis Verify: {status}\n\n"
        f"**AI-relevant files changed:** {len(files)}\n\n{file_lines}\n\n"
        f"{command_line}"
        f"{details}"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run configured AI evaluations for relevant Git changes.")
    parser.add_argument("--version", action="version", version=__version__)
    parser.add_argument("--config", default=".vouqis-verify.json", type=Path)
    parser.add_argument("--repo", default=Path.cwd(), type=Path)
    parser.add_argument("--base", default="HEAD^")
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--report", default=Path("vouqis-verify-report.md"), type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config_path = args.config if args.config.is_absolute() else args.repo / args.config
    report_path = args.report if args.report.is_absolute() else args.repo / args.report
    try:
        config = load_config(config_path)
        files = affected_files(changed_files(args.repo, args.base, args.head), config.paths)
        if not files:
            body = report("SKIPPED", files, config.command)
            exit_code = 0
        else:
            try:
                # ponytail: capture logs in memory; stream to a file if evaluators emit very large output.
                result = subprocess.run(
                    config.command,
                    cwd=args.repo,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                )
                output = "\n".join(part for part in (result.stdout.strip(), result.stderr.strip()) if part)
                exit_code = result.returncode
            except OSError as error:
                output = str(error)
                exit_code = 127
            body = report("PASSED" if exit_code == 0 else "FAILED", files, config.command, output)

    except (ValueError, RuntimeError, OSError) as error:
        print(f"vouqis-verify: {error}", file=sys.stderr)
        body = report("ERROR", [], (), str(error))
        exit_code = 2

    try:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(body, encoding="utf-8")
    except OSError as error:
        print(f"vouqis-verify: could not write report: {error}", file=sys.stderr)
        return 2
    print(body)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
