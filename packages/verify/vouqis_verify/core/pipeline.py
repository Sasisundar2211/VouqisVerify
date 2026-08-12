from __future__ import annotations

from vouqis_verify.config.schema import Config
from vouqis_verify.core.diff import detect_ai_changes
from vouqis_verify.core.runner import run_eval
from vouqis_verify.report.render import Report, build_report


def run_verification(cfg: Config, baseline: str) -> Report:
    changed = detect_ai_changes(cfg.ai_paths, baseline)
    diff_failed = changed is None
    result = run_eval(cfg.eval_command, timeout=cfg.timeout_seconds)
    return build_report(cfg, changed or [], result, diff_failed=diff_failed)
