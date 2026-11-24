"""Data models shared by the runner, checks, comparison, and reports.

Every model round-trips through plain JSON (``to_dict`` / ``from_dict``) so a
run can be saved as a baseline and compared later by a different process.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

RUN_SCHEMA_VERSION = 1

DETERMINISTIC = "deterministic"
HEURISTIC = "heuristic"


@dataclass
class Context:
    """One retrieved context item (a chunk or document) from a RAG pipeline."""

    text: str
    id: Optional[str] = None
    score: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {"id": self.id, "text": self.text, "score": self.score}

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> Context:
        return cls(text=data.get("text", ""), id=data.get("id"), score=data.get("score"))


@dataclass
class ToolCall:
    """One tool invocation recorded in an agent trace."""

    name: str
    args: Dict[str, Any] = field(default_factory=dict)
    result: Any = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {"name": self.name, "args": self.args, "result": self.result, "error": self.error}

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ToolCall:
        return cls(
            name=data["name"],
            args=data.get("args") or {},
            result=data.get("result"),
            error=data.get("error"),
        )


@dataclass
class Output:
    """Normalized output of one workflow invocation."""

    answer: Optional[str] = None
    contexts: List[Context] = field(default_factory=list)
    tool_calls: List[ToolCall] = field(default_factory=list)
    stop_reason: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "answer": self.answer,
            "contexts": [c.to_dict() for c in self.contexts],
            "tool_calls": [t.to_dict() for t in self.tool_calls],
            "stop_reason": self.stop_reason,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> Output:
        return cls(
            answer=data.get("answer"),
            contexts=[Context.from_dict(c) for c in data.get("contexts", [])],
            tool_calls=[ToolCall.from_dict(t) for t in data.get("tool_calls", [])],
            stop_reason=data.get("stop_reason"),
            metadata=data.get("metadata") or {},
        )


@dataclass
class CheckResult:
    name: str
    passed: bool
    message: str
    kind: str = DETERMINISTIC
    metrics: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "passed": self.passed,
            "message": self.message,
            "kind": self.kind,
            "metrics": self.metrics,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> CheckResult:
        return cls(
            name=data["name"],
            passed=bool(data["passed"]),
            message=data.get("message", ""),
            kind=data.get("kind", DETERMINISTIC),
            metrics=dict(data.get("metrics") or {}),
        )


@dataclass
class Attempt:
    """One execution of a case. Cases with ``repeat > 1`` have several."""

    output: Optional[Output]
    checks: List[CheckResult]
    latency_ms: float
    error: Optional[str] = None

    @property
    def passed(self) -> bool:
        return self.error is None and all(c.passed for c in self.checks)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "output": self.output.to_dict() if self.output else None,
            "checks": [c.to_dict() for c in self.checks],
            "latency_ms": self.latency_ms,
            "error": self.error,
            "passed": self.passed,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> Attempt:
        return cls(
            output=Output.from_dict(data["output"]) if data.get("output") else None,
            checks=[CheckResult.from_dict(c) for c in data.get("checks", [])],
            latency_ms=float(data.get("latency_ms", 0.0)),
            error=data.get("error"),
        )


@dataclass
class CaseResult:
    id: str
    input: Any
    attempts: List[Attempt]
    min_pass_rate: float = 1.0

    @property
    def pass_rate(self) -> float:
        if not self.attempts:
            return 0.0
        return sum(1 for a in self.attempts if a.passed) / len(self.attempts)

    @property
    def passed(self) -> bool:
        return bool(self.attempts) and self.pass_rate >= self.min_pass_rate

    @property
    def errored(self) -> bool:
        return any(a.error is not None for a in self.attempts)

    @property
    def primary(self) -> Optional[Attempt]:
        return self.attempts[0] if self.attempts else None

    @property
    def mean_latency_ms(self) -> float:
        if not self.attempts:
            return 0.0
        return sum(a.latency_ms for a in self.attempts) / len(self.attempts)

    def metrics(self) -> Dict[str, float]:
        """Mean of every numeric metric across attempts, keyed ``check.metric``."""
        sums: Dict[str, float] = {}
        counts: Dict[str, int] = {}
        for attempt in self.attempts:
            for check in attempt.checks:
                for key, value in check.metrics.items():
                    full = f"{check.name}.{key}"
                    sums[full] = sums.get(full, 0.0) + float(value)
                    counts[full] = counts.get(full, 0) + 1
        return {k: sums[k] / counts[k] for k in sums}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "input": self.input,
            "passed": self.passed,
            "pass_rate": self.pass_rate,
            "min_pass_rate": self.min_pass_rate,
            "mean_latency_ms": self.mean_latency_ms,
            "metrics": self.metrics(),
            "attempts": [a.to_dict() for a in self.attempts],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> CaseResult:
        return cls(
            id=data["id"],
            input=data.get("input"),
            attempts=[Attempt.from_dict(a) for a in data.get("attempts", [])],
            min_pass_rate=float(data.get("min_pass_rate", 1.0)),
        )


@dataclass
class RunResult:
    suite_name: str
    suite_fingerprint: str
    target: str
    started_at: str
    duration_ms: float
    cases: List[CaseResult]
    tool_version: str
    target_kwargs: Dict[str, Any] = field(default_factory=dict)

    @property
    def passed(self) -> bool:
        return all(c.passed for c in self.cases)

    def case(self, case_id: str) -> Optional[CaseResult]:
        for c in self.cases:
            if c.id == case_id:
                return c
        return None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "schema_version": RUN_SCHEMA_VERSION,
            "tool_version": self.tool_version,
            "suite_name": self.suite_name,
            "suite_fingerprint": self.suite_fingerprint,
            "target": self.target,
            "target_kwargs": self.target_kwargs,
            "started_at": self.started_at,
            "duration_ms": self.duration_ms,
            "summary": {
                "cases": len(self.cases),
                "passed": sum(1 for c in self.cases if c.passed),
                "failed": sum(1 for c in self.cases if not c.passed),
                "errored": sum(1 for c in self.cases if c.errored),
            },
            "cases": [c.to_dict() for c in self.cases],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> RunResult:
        version = data.get("schema_version")
        if version != RUN_SCHEMA_VERSION:
            raise ValueError(f"Unsupported run schema_version {version!r}; expected {RUN_SCHEMA_VERSION}.")
        return cls(
            suite_name=data["suite_name"],
            suite_fingerprint=data.get("suite_fingerprint", ""),
            target=data.get("target", ""),
            started_at=data.get("started_at", ""),
            duration_ms=float(data.get("duration_ms", 0.0)),
            cases=[CaseResult.from_dict(c) for c in data.get("cases", [])],
            tool_version=data.get("tool_version", ""),
            target_kwargs=data.get("target_kwargs") or {},
        )
