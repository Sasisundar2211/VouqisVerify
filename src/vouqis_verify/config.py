"""Load and validate a verification suite file (YAML or JSON)."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from .checks import validate_check
from .errors import ConfigError

COMPARE_CATEGORIES = ("status", "metric", "drift", "latency")


@dataclass
class TargetConfig:
    callable: str
    kwargs: Dict[str, Any] = field(default_factory=dict)
    timeout_s: Optional[float] = 60.0


@dataclass
class CompareConfig:
    fail_on: List[str] = field(default_factory=lambda: ["status", "metric"])
    metric_tolerance: float = 0.0
    drift_threshold: float = 0.6
    latency_factor: float = 2.0
    latency_min_ms: float = 50.0
    allow_known_failures: bool = False


@dataclass
class CaseConfig:
    id: str
    input: Any
    checks: List[Dict[str, Any]]
    repeat: int = 1
    min_pass_rate: float = 1.0


@dataclass
class Suite:
    name: str
    path: Path
    target: TargetConfig
    cases: List[CaseConfig]
    compare: CompareConfig = field(default_factory=CompareConfig)

    @property
    def base_dir(self) -> Path:
        return self.path.parent

    def fingerprint(self) -> str:
        """Hash of case ids, inputs, and checks. Changes when the test definition changes."""
        payload = [{"id": c.id, "input": c.input, "checks": c.checks, "repeat": c.repeat} for c in self.cases]
        blob = json.dumps(payload, sort_keys=True, default=str).encode()
        return hashlib.sha256(blob).hexdigest()[:16]


def _require_mapping(value: Any, where: str) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ConfigError(f"{where} must be a mapping.")
    return value


def _reject_unknown(data: Dict[str, Any], allowed: set, where: str) -> None:
    unknown = set(data) - allowed
    if unknown:
        raise ConfigError(f"{where}: unknown key(s) {sorted(unknown)}. Allowed: {sorted(allowed)}.")


def _number(value: Any, where: str, *, minimum: Optional[float] = None, maximum: Optional[float] = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ConfigError(f"{where} must be a number.")
    if minimum is not None and value < minimum:
        raise ConfigError(f"{where} must be >= {minimum}.")
    if maximum is not None and value > maximum:
        raise ConfigError(f"{where} must be <= {maximum}.")
    return float(value)


def _int(value: Any, where: str, *, minimum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ConfigError(f"{where} must be an integer >= {minimum}.")
    return value


def _parse_target(raw: Any) -> TargetConfig:
    if isinstance(raw, str):
        raw = {"callable": raw}
    data = _require_mapping(raw, "target")
    _reject_unknown(data, {"callable", "kwargs", "timeout_s"}, "target")
    spec = data.get("callable")
    if not isinstance(spec, str) or ":" not in spec:
        raise ConfigError("target.callable must be a string like 'module:function' or 'file.py:function'.")
    kwargs = _require_mapping(data.get("kwargs", {}) or {}, "target.kwargs")
    timeout = data.get("timeout_s", 60.0)
    if timeout is not None:
        timeout = _number(timeout, "target.timeout_s", minimum=0.001)
    return TargetConfig(callable=spec, kwargs=dict(kwargs), timeout_s=timeout)


def _parse_compare(raw: Any) -> CompareConfig:
    data = _require_mapping(raw or {}, "compare")
    _reject_unknown(
        data,
        {"fail_on", "metric_tolerance", "drift_threshold", "latency_factor", "latency_min_ms", "allow_known_failures"},
        "compare",
    )
    cfg = CompareConfig()
    if "fail_on" in data:
        fail_on = data["fail_on"]
        if not isinstance(fail_on, list) or any(c not in COMPARE_CATEGORIES for c in fail_on):
            raise ConfigError(f"compare.fail_on must be a list drawn from {list(COMPARE_CATEGORIES)}.")
        cfg.fail_on = list(fail_on)
    if "metric_tolerance" in data:
        cfg.metric_tolerance = _number(data["metric_tolerance"], "compare.metric_tolerance", minimum=0)
    if "drift_threshold" in data:
        cfg.drift_threshold = _number(data["drift_threshold"], "compare.drift_threshold", minimum=0, maximum=1)
    if "latency_factor" in data:
        cfg.latency_factor = _number(data["latency_factor"], "compare.latency_factor", minimum=1)
    if "latency_min_ms" in data:
        cfg.latency_min_ms = _number(data["latency_min_ms"], "compare.latency_min_ms", minimum=0)
    if "allow_known_failures" in data:
        if not isinstance(data["allow_known_failures"], bool):
            raise ConfigError("compare.allow_known_failures must be true or false.")
        cfg.allow_known_failures = data["allow_known_failures"]
    return cfg


def parse_suite(data: Any, path: Path) -> Suite:
    data = _require_mapping(data, "suite file")
    _reject_unknown(data, {"name", "target", "defaults", "compare", "cases"}, "suite")

    name = data.get("name") or path.stem
    if not isinstance(name, str):
        raise ConfigError("name must be a string.")
    if "target" not in data:
        raise ConfigError("suite is missing 'target'.")
    target = _parse_target(data["target"])
    compare = _parse_compare(data.get("compare"))

    defaults = _require_mapping(data.get("defaults", {}) or {}, "defaults")
    _reject_unknown(defaults, {"checks", "repeat", "min_pass_rate"}, "defaults")
    default_checks = defaults.get("checks", []) or []
    if not isinstance(default_checks, list):
        raise ConfigError("defaults.checks must be a list.")
    for i, chk in enumerate(default_checks):
        validate_check(chk, f"defaults.checks[{i}]")
    default_repeat = _int(defaults.get("repeat", 1), "defaults.repeat", minimum=1)
    default_rate = _number(defaults.get("min_pass_rate", 1.0), "defaults.min_pass_rate", minimum=0, maximum=1)

    raw_cases = data.get("cases")
    if not isinstance(raw_cases, list) or not raw_cases:
        raise ConfigError("suite needs a non-empty 'cases' list.")

    cases: List[CaseConfig] = []
    seen = set()
    for i, raw in enumerate(raw_cases):
        where = f"cases[{i}]"
        case = _require_mapping(raw, where)
        _reject_unknown(case, {"id", "input", "checks", "repeat", "min_pass_rate"}, where)
        cid = case.get("id")
        if not isinstance(cid, str) or not cid.strip():
            raise ConfigError(f"{where}.id must be a non-empty string.")
        if cid in seen:
            raise ConfigError(f"{where}: duplicate case id {cid!r}.")
        seen.add(cid)
        if "input" not in case:
            raise ConfigError(f"{where} ({cid}) is missing 'input'.")
        own_checks = case.get("checks", []) or []
        if not isinstance(own_checks, list):
            raise ConfigError(f"{where}.checks must be a list.")
        for j, chk in enumerate(own_checks):
            validate_check(chk, f"{where}.checks[{j}]")
        checks = [dict(c) for c in default_checks] + [dict(c) for c in own_checks]
        if not checks:
            raise ConfigError(f"{where} ({cid}) has no checks; add checks to the case or to defaults.checks.")
        cases.append(
            CaseConfig(
                id=cid,
                input=case["input"],
                checks=checks,
                repeat=_int(case.get("repeat", default_repeat), f"{where}.repeat", minimum=1),
                min_pass_rate=_number(
                    case.get("min_pass_rate", default_rate), f"{where}.min_pass_rate", minimum=0, maximum=1
                ),
            )
        )
    return Suite(name=name, path=path, target=target, cases=cases, compare=compare)


def load_suite(path: str | Path) -> Suite:
    p = Path(path).resolve()
    if not p.is_file():
        raise ConfigError(f"Suite file not found: {p}")
    text = p.read_text(encoding="utf-8")
    try:
        data = json.loads(text) if p.suffix == ".json" else yaml.safe_load(text)
    except (yaml.YAMLError, ValueError) as exc:
        raise ConfigError(f"Cannot parse {p.name}: {exc}") from exc
    return parse_suite(data, p)
