from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from vouqis_verify.config.schema import ConfigError, load_config

_CI_ENV_VARS = ("GITHUB_TOKEN", "GITHUB_REPOSITORY", "PR_NUMBER")


@dataclass
class DoctorResult:
    config_exists: bool
    config_ok: bool
    config_error: str | None
    git_ok: bool
    git_error: str | None
    env_vars: dict[str, bool] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.config_exists and self.config_ok and self.git_ok


def run_doctor(config_path: Path) -> DoctorResult:
    config_exists = config_path.exists()
    config_ok = False
    config_error: str | None = None
    if config_exists:
        try:
            load_config(config_path)
            config_ok = True
        except ConfigError as exc:
            config_error = str(exc)

    git_ok, git_error = _check_git()

    return DoctorResult(
        config_exists=config_exists,
        config_ok=config_ok,
        config_error=config_error,
        git_ok=git_ok,
        git_error=git_error,
        env_vars={var: bool(os.environ.get(var)) for var in _CI_ENV_VARS},
    )


def _check_git() -> tuple[bool, str | None]:
    try:
        result = subprocess.run(["git", "rev-parse", "--git-dir"], capture_output=True)
    except FileNotFoundError:
        return False, "git executable not found — install Git and ensure it is on PATH"
    if result.returncode == 0:
        return True, None
    return False, "not inside a git repository"
