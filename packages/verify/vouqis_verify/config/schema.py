from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

_DEFAULT_AI_PATHS = ["prompts/", "src/agents/", "evals/", "models/", "rag/", "tools/"]


class ConfigError(ValueError):
    """Raised when an existing Vouqis configuration cannot be used safely."""


@dataclass
class Config:
    eval_command: str = "pytest"
    baseline: str = "main"
    ai_paths: list[str] = field(default_factory=lambda: list(_DEFAULT_AI_PATHS))
    timeout_seconds: int = 300
    feedback_url: Optional[str] = None
    project_name: Optional[str] = None


def load_config(path: Path) -> Config:
    if not path.exists():
        return Config()
    try:
        with path.open(encoding="utf-8") as config_file:
            data = yaml.safe_load(config_file)
    except (OSError, yaml.YAMLError) as exc:
        raise ConfigError(f"could not parse {path}: {exc}") from exc

    if data is None:
        return Config()
    if not isinstance(data, dict):
        raise ConfigError(f"{path} must contain a YAML mapping")

    try:
        config = Config(
            eval_command=data.get("eval_command", "pytest"),
            baseline=data.get("baseline", "main"),
            ai_paths=data.get("ai_paths", _DEFAULT_AI_PATHS),
            timeout_seconds=int(data.get("timeout_seconds", 300)),
            feedback_url=data.get("feedback_url"),
            project_name=data.get("project_name"),
        )
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"{path} contains an invalid value: {exc}") from exc

    if not isinstance(config.eval_command, str) or not config.eval_command.strip():
        raise ConfigError(f"{path} field 'eval_command' must be a non-empty string")
    if not isinstance(config.baseline, str) or not config.baseline.strip():
        raise ConfigError(f"{path} field 'baseline' must be a non-empty string")
    if not isinstance(config.ai_paths, list) or not all(
        isinstance(ai_path, str) and ai_path for ai_path in config.ai_paths
    ):
        raise ConfigError(f"{path} field 'ai_paths' must be a list of non-empty strings")
    if config.timeout_seconds <= 0:
        raise ConfigError(f"{path} field 'timeout_seconds' must be greater than zero")
    if config.feedback_url is not None and not isinstance(config.feedback_url, str):
        raise ConfigError(f"{path} field 'feedback_url' must be a string")
    if config.project_name is not None and not isinstance(config.project_name, str):
        raise ConfigError(f"{path} field 'project_name' must be a string")
    return config


def write_default_config(path: Path) -> None:
    if path.exists():
        raise FileExistsError(f"{path} already exists")
    path.write_text(
        "eval_command: pytest tests/eval/ -v\n"
        "baseline: main\n"
        "ai_paths:\n"
        "  - prompts/\n"
        "  - src/agents/\n"
        "  - evals/\n"
        "  - models/\n"
        "  - rag/\n"
        "  - tools/\n"
    )
