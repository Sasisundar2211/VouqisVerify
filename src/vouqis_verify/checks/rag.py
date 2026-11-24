"""Checks on retrieval and grounding for RAG pipelines.

Retrieval metrics require the target to return ``contexts`` with stable ``id``
values (document or chunk ids) in ranked order.
"""

from __future__ import annotations

from typing import Any, List, Mapping, Optional

from ..models import HEURISTIC, CheckResult, Output
from ..textutil import content_tokens, sentences
from . import CheckContext, check


def _ids(out: Output, k: Optional[int]) -> List[Optional[str]]:
    ranked = [c.id for c in out.contexts]
    return ranked[: int(k)] if k is not None else ranked


def _expected(p: Mapping[str, Any]) -> List[str]:
    value = p["expected_ids"]
    return [str(v) for v in value] if isinstance(value, list) else [str(value)]


def _missing_ids(out: Output) -> Optional[CheckResult]:
    if out.contexts and any(c.id is None for c in out.contexts):
        return CheckResult("", False, "retrieval metrics need an 'id' on every context item")
    return None


@check("min_contexts", required={"value"}, description="At least N contexts were retrieved.")
def min_contexts(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    n = len(out.contexts)
    ok = n >= int(p["value"])
    return CheckResult("", ok, f"retrieved {n} context(s), need at least {p['value']}")


@check(
    "retrieval_recall",
    required={"expected_ids"},
    optional={"k", "min"},
    description="Share of expected ids found in the top-k contexts.",
)
def retrieval_recall(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    bad = _missing_ids(out)
    if bad:
        return bad
    expected = _expected(p)
    got = set(_ids(out, p.get("k")))
    hits = [e for e in expected if e in got]
    recall = len(hits) / len(expected) if expected else 1.0
    threshold = float(p.get("min", 1.0))
    missing = [e for e in expected if e not in got]
    msg = f"recall@{p.get('k', 'all')} = {recall:.2f} (min {threshold:.2f})"
    if missing:
        msg += f"; missing {missing}"
    return CheckResult("", recall >= threshold, msg, metrics={"recall": recall})


@check(
    "retrieval_precision",
    required={"expected_ids"},
    optional={"k", "min"},
    description="Share of top-k contexts that are expected ids.",
)
def retrieval_precision(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    bad = _missing_ids(out)
    if bad:
        return bad
    expected = set(_expected(p))
    got = _ids(out, p.get("k"))
    precision = (sum(1 for i in got if i in expected) / len(got)) if got else 0.0
    threshold = float(p.get("min", 0.0))
    msg = f"precision@{p.get('k', 'all')} = {precision:.2f} (min {threshold:.2f})"
    return CheckResult("", precision >= threshold, msg, metrics={"precision": precision})


@check(
    "retrieval_mrr",
    required={"expected_ids"},
    optional={"min"},
    description="Reciprocal rank of the first expected id.",
)
def retrieval_mrr(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    bad = _missing_ids(out)
    if bad:
        return bad
    expected = set(_expected(p))
    mrr = 0.0
    for rank, cid in enumerate(_ids(out, None), start=1):
        if cid in expected:
            mrr = 1.0 / rank
            break
    threshold = float(p.get("min", 0.0))
    return CheckResult("", mrr >= threshold, f"MRR = {mrr:.2f} (min {threshold:.2f})", metrics={"mrr": mrr})


@check(
    "context_excludes_ids",
    required={"ids"},
    description="None of the given ids were retrieved (access-control and tenant-isolation leaks).",
)
def context_excludes_ids(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    forbidden = {str(i) for i in (p["ids"] if isinstance(p["ids"], list) else [p["ids"]])}
    leaked = [c.id for c in out.contexts if c.id in forbidden]
    if leaked:
        return CheckResult("", False, f"forbidden context id(s) retrieved: {leaked}")
    return CheckResult("", True, "no forbidden contexts retrieved")


@check(
    "context_contains",
    required={"value"},
    optional={"case_sensitive"},
    description="Retrieved context text contains every value (catches missing docs and truncation).",
)
def context_contains(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    sensitive = bool(p.get("case_sensitive", False))
    joined = "\n".join(c.text for c in out.contexts)
    joined = joined if sensitive else joined.lower()
    values = [str(v) for v in p["value"]] if isinstance(p["value"], list) else [str(p["value"])]
    missing = [v for v in values if (v if sensitive else v.lower()) not in joined]
    if missing:
        return CheckResult("", False, f"retrieved context is missing: {missing}")
    return CheckResult("", True, "retrieved context contains all expected values")


@check("max_context_chars", required={"value"}, description="Total retrieved context fits a character budget.")
def max_context_chars(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    total = sum(len(c.text) for c in out.contexts)
    ok = total <= int(p["value"])
    return CheckResult("", ok, f"context is {total} chars (budget {p['value']})")


@check(
    "groundedness",
    optional={"min", "overlap"},
    kind=HEURISTIC,
    description="Share of answer sentences whose content words appear in retrieved context (lexical heuristic).",
)
def groundedness(p: Mapping[str, Any], out: Output, ctx: CheckContext) -> CheckResult:
    threshold = float(p.get("min", 0.8))
    overlap = float(p.get("overlap", 0.6))
    context_vocab = set()
    for c in out.contexts:
        context_vocab |= content_tokens(c.text)

    considered = supported = 0
    unsupported: List[str] = []
    for sentence in sentences(out.answer or ""):
        words = content_tokens(sentence)
        if not words:
            continue
        considered += 1
        if len(words & context_vocab) / len(words) >= overlap:
            supported += 1
        else:
            unsupported.append(sentence)

    if considered == 0:
        return CheckResult("", False, "answer has no content to ground", metrics={"score": 0.0})
    score = supported / considered
    msg = f"{supported}/{considered} sentence(s) supported by context, score {score:.2f} (min {threshold:.2f})"
    if unsupported:
        msg += f"; unsupported: {unsupported[0][:120]!r}"
    return CheckResult("", score >= threshold, msg, metrics={"score": score})
