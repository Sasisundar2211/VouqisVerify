"""Check registry.

A check inspects one normalized :class:`~vouqis_verify.models.Output` and returns a
:class:`~vouqis_verify.models.CheckResult`. Metrics emitted by checks are
higher-is-better values in [0, 1] so baseline comparison can treat a drop as a
regression without per-metric configuration.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, FrozenSet, Iterable, List, Mapping, Sequence

from ..errors import ConfigError
from ..models import DETERMINISTIC, CheckResult, Output

CheckFn = Callable[[Mapping[str, Any], Output, "CheckContext"], CheckResult]


@dataclass(frozen=True)
class CheckContext:
    latency_ms: float


@dataclass(frozen=True)
class CheckSpec:
    type: str
    fn: CheckFn
    required: FrozenSet[str]
    optional: FrozenSet[str]
    kind: str
    description: str


REGISTRY: Dict[str, CheckSpec] = {}

# Parameters every check accepts.
COMMON_PARAMS = frozenset({"type", "name"})


def check(
    type_: str,
    *,
    required: Iterable[str] = (),
    optional: Iterable[str] = (),
    kind: str = DETERMINISTIC,
    description: str = "",
) -> Callable[[CheckFn], CheckFn]:
    def decorator(fn: CheckFn) -> CheckFn:
        if type_ in REGISTRY:
            raise RuntimeError(f"Duplicate check type {type_!r}")
        REGISTRY[type_] = CheckSpec(
            type=type_,
            fn=fn,
            required=frozenset(required),
            optional=frozenset(optional),
            kind=kind,
            description=description or (fn.__doc__ or "").strip().splitlines()[0],
        )
        return fn

    return decorator


def validate_check(params: Any, where: str) -> None:
    if not isinstance(params, dict):
        raise ConfigError(f"{where}: each check must be a mapping with a 'type'.")
    type_ = params.get("type")
    if type_ not in REGISTRY:
        known = ", ".join(sorted(REGISTRY))
        raise ConfigError(f"{where}: unknown check type {type_!r}. Known types: {known}.")
    spec = REGISTRY[type_]
    missing = spec.required - params.keys()
    if missing:
        raise ConfigError(f"{where}: check {type_!r} is missing required parameter(s): {', '.join(sorted(missing))}.")
    unknown = params.keys() - spec.required - spec.optional - COMMON_PARAMS
    if unknown:
        allowed = ", ".join(sorted(spec.required | spec.optional)) or "(none)"
        raise ConfigError(
            f"{where}: check {type_!r} got unknown parameter(s): {', '.join(sorted(unknown))}. Allowed: {allowed}."
        )
    name = params.get("name")
    if name is not None and (not isinstance(name, str) or not name.strip()):
        raise ConfigError(f"{where}: check 'name' must be a non-empty string.")


def check_names(checks: Sequence[Mapping[str, Any]]) -> List[str]:
    """Stable, unique names: explicit ``name`` or ``type``, suffixed ``#2``, ``#3`` on repeats."""
    seen: Dict[str, int] = {}
    names = []
    for params in checks:
        base = params.get("name") or params["type"]
        seen[base] = seen.get(base, 0) + 1
        names.append(base if seen[base] == 1 else f"{base}#{seen[base]}")
    return names


def run_checks(checks: Sequence[Mapping[str, Any]], output: Output, ctx: CheckContext) -> List[CheckResult]:
    results = []
    for name, params in zip(check_names(checks), checks):
        spec = REGISTRY[params["type"]]
        try:
            result = spec.fn(params, output, ctx)
        except Exception as exc:  # a check bug must surface as a failure, never as a pass
            result = CheckResult(name=name, passed=False, message=f"Check raised {type(exc).__name__}: {exc}")
        result.name = name
        result.kind = spec.kind
        results.append(result)
    return results


# Register built-in checks.
from . import agent, generic, rag  # noqa: E402,F401
