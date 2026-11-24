"""Small, dependency-free text helpers used by heuristic checks and drift detection."""

from __future__ import annotations

import difflib
import re
from typing import List, Set

_TOKEN_RE = re.compile(r"[a-z0-9]+(?:[.'][a-z0-9]+)*")
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")

STOPWORDS = frozenset(
    """a an and are as at be been but by can could did do does for from had has have
    he her his how i if in into is it its may me my no not of on or our she should so
    than that the their them then there these they this those to was we were what when
    where which who why will with would you your""".split()
)


def tokens(text: str) -> List[str]:
    return _TOKEN_RE.findall((text or "").lower())


def content_tokens(text: str) -> Set[str]:
    return {t for t in tokens(text) if t not in STOPWORDS}


def sentences(text: str) -> List[str]:
    return [s.strip() for s in _SENTENCE_RE.split((text or "").strip()) if s.strip()]


def similarity(a: str, b: str) -> float:
    """Token-sequence similarity in [0, 1]. 1.0 means identical token streams."""
    ta, tb = tokens(a), tokens(b)
    if not ta and not tb:
        return 1.0
    return difflib.SequenceMatcher(a=ta, b=tb, autojunk=False).ratio()


def jaccard(a: Set[str], b: Set[str]) -> float:
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)
