"""Vouqis Verify: catch silent failures and regressions in RAG and agent workflows."""

__version__ = "0.1.0"

from .compare import Comparison, Finding, compare_runs, verdict  # noqa: E402
from .config import Suite, load_suite  # noqa: E402
from .models import CheckResult, Context, Output, RunResult, ToolCall  # noqa: E402
from .report import load_run, save_run  # noqa: E402
from .runner import run_suite  # noqa: E402

__all__ = [
    "__version__",
    "CheckResult",
    "Comparison",
    "Context",
    "Finding",
    "Output",
    "RunResult",
    "Suite",
    "ToolCall",
    "compare_runs",
    "load_run",
    "load_suite",
    "run_suite",
    "save_run",
    "verdict",
]
