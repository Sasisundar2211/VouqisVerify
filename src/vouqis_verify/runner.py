"""Execute a suite's cases against the target and evaluate checks."""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from . import __version__
from .checks import CheckContext, run_checks
from .config import CaseConfig, Suite
from .errors import ConfigError, InvalidOutputError
from .models import Attempt, CaseResult, RunResult
from .target import load_callable, normalize_output

ProgressFn = Callable[[CaseResult], None]


def _invoke(
    fn: Callable[..., Any], arg: Any, kwargs: Dict[str, Any], timeout_s: Optional[float]
) -> Tuple[Any, Optional[str], float]:
    """Call ``fn`` in a daemon thread. Returns (value, error, latency_ms).

    Python cannot kill a thread, so a timed-out call keeps running in the
    background; the run moves on and records the timeout as an error.
    """
    box: Dict[str, Any] = {}

    def target() -> None:
        try:
            box["value"] = fn(arg, **kwargs)
        except BaseException as exc:  # report everything the workflow raises
            box["error"] = f"{type(exc).__name__}: {exc}"

    start = time.perf_counter()
    thread = threading.Thread(target=target, name="vouqis-target", daemon=True)
    thread.start()
    thread.join(timeout_s)
    latency_ms = (time.perf_counter() - start) * 1000.0
    if thread.is_alive():
        return None, f"Timeout: no result after {timeout_s} s", latency_ms
    if "error" in box:
        return None, box["error"], latency_ms
    return box.get("value"), None, latency_ms


def run_case(
    fn: Callable[..., Any], case: CaseConfig, kwargs: Dict[str, Any], timeout_s: Optional[float]
) -> CaseResult:
    attempts: List[Attempt] = []
    for _ in range(case.repeat):
        value, error, latency_ms = _invoke(fn, case.input, kwargs, timeout_s)
        if error is not None:
            attempts.append(Attempt(output=None, checks=[], latency_ms=latency_ms, error=error))
            continue
        try:
            output = normalize_output(value)
        except InvalidOutputError as exc:
            attempts.append(Attempt(output=None, checks=[], latency_ms=latency_ms, error=f"InvalidOutput: {exc}"))
            continue
        checks = run_checks(case.checks, output, CheckContext(latency_ms=latency_ms))
        attempts.append(Attempt(output=output, checks=checks, latency_ms=latency_ms))
    return CaseResult(id=case.id, input=case.input, attempts=attempts, min_pass_rate=case.min_pass_rate)


def run_suite(
    suite: Suite,
    *,
    target_overrides: Optional[Dict[str, Any]] = None,
    case_ids: Optional[Iterable[str]] = None,
    progress: Optional[ProgressFn] = None,
) -> RunResult:
    kwargs = {**suite.target.kwargs, **(target_overrides or {})}
    cases = suite.cases
    if case_ids:
        wanted = list(case_ids)
        unknown = sorted(set(wanted) - {c.id for c in cases})
        if unknown:
            raise ConfigError(f"Unknown case id(s): {unknown}")
        cases = [c for c in cases if c.id in wanted]

    fn = load_callable(suite.target.callable, suite.base_dir)
    started = datetime.now(timezone.utc)
    t0 = time.perf_counter()
    results = []
    for case in cases:
        result = run_case(fn, case, kwargs, suite.target.timeout_s)
        results.append(result)
        if progress:
            progress(result)
    return RunResult(
        suite_name=suite.name,
        suite_fingerprint=suite.fingerprint(),
        target=suite.target.callable,
        started_at=started.isoformat(timespec="seconds"),
        duration_ms=(time.perf_counter() - t0) * 1000.0,
        cases=results,
        tool_version=__version__,
        target_kwargs=kwargs,
    )
