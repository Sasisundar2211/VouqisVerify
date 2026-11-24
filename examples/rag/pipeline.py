"""A small but complete RAG pipeline used as a Vouqis Verify reference workflow.

Stages: ingest markdown docs -> chunk -> TF-IDF embed -> cosine retrieval with a
tenant access filter -> build a context under a character budget -> extractive
answer generation.

The generator is extractive (it selects sentences from the retrieved context)
so the example runs offline and deterministically. In your project, replace
``answer`` with a function that calls your real retriever and LLM and returns
the same dict shape.

Knobs that reproduce common regressions (pass via ``target.kwargs`` or ``-T``):

* ``top_k``                - fewer results drops recall on multi-document questions.
* ``chunk_size``           - words per chunk; changes what each retrieved unit holds.
* ``max_context_chars``    - a tighter budget truncates facts out of the context.
* ``apply_access_filter``  - ``false`` leaks other tenants' documents.
* ``generator``            - ``"freeform"`` answers without using the context (ungrounded).
"""

from __future__ import annotations

import math
import re
from collections import Counter
from functools import cache
from pathlib import Path
from typing import Any, Dict, List, Tuple

DOCS_DIR = Path(__file__).parent / "docs"
_WORD = re.compile(r"[a-z0-9]+")
_SENT = re.compile(r"(?<=[.!?])\s+")
_STOP = frozenset(
    "a an and are as at be by can do does for from has have how i if in is it its my "
    "of on or our the their to was what when where which who will with you your".split()
)


def _stem(word: str) -> str:
    return word[:-1] if len(word) > 3 and word.endswith("s") and not word.endswith("ss") else word


def _terms(text: str) -> List[str]:
    # len > 1 drops possessive fragments ("ceo's" -> "ceo", "s") that would match unrelated text.
    return [_stem(w) for w in _WORD.findall(text.lower()) if len(w) > 1 and w not in _STOP]


# ---- ingestion -------------------------------------------------------------


def _parse(path: Path) -> Dict[str, str]:
    raw = path.read_text(encoding="utf-8")
    meta: Dict[str, str] = {}
    if raw.startswith("---"):
        _, front, raw = raw.split("---", 2)
        for line in front.strip().splitlines():
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip()
    lines = raw.strip().splitlines()
    title = lines[0].lstrip("# ").strip() if lines and lines[0].startswith("#") else path.stem
    body = "\n".join(lines[1:]).strip()
    return {"id": path.stem, "tenant": meta.get("tenant", "public"), "title": title, "body": body}


@cache
def load_documents(docs_dir: str = str(DOCS_DIR)) -> Tuple[Dict[str, str], ...]:
    return tuple(_parse(p) for p in sorted(Path(docs_dir).glob("*.md")))


# ---- chunking --------------------------------------------------------------


def chunk(doc: Dict[str, str], chunk_size: int) -> List[Dict[str, str]]:
    chunks = []
    for paragraph in (p.strip() for p in doc["body"].split("\n\n")):
        words = paragraph.split()
        for start in range(0, len(words), chunk_size):
            chunks.append(
                {
                    "doc_id": doc["id"],
                    "tenant": doc["tenant"],
                    "title": doc["title"],
                    "text": " ".join(words[start : start + chunk_size]),
                }
            )
    return chunks


# ---- embedding and retrieval -----------------------------------------------


class TfidfIndex:
    def __init__(self, chunks: List[Dict[str, str]]):
        self.chunks = chunks
        docs_terms = [_terms(c["title"] + " " + c["text"]) for c in chunks]
        df = Counter(t for terms in docs_terms for t in set(terms))
        n = len(chunks)
        self.idf = {t: math.log((1 + n) / (1 + d)) + 1.0 for t, d in df.items()}
        self.vectors = [self._embed_terms(terms) for terms in docs_terms]

    def _embed_terms(self, terms: List[str]) -> Dict[str, float]:
        tf = Counter(terms)
        vec = {t: c * self.idf.get(t, 0.0) for t, c in tf.items()}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        return {t: v / norm for t, v in vec.items()}

    def search(self, query: str, top_k: int, allowed_tenants: Any) -> List[Tuple[float, Dict[str, str]]]:
        q = self._embed_terms(_terms(query))
        scored = []
        for vec, ch in zip(self.vectors, self.chunks):
            if allowed_tenants is not None and ch["tenant"] not in allowed_tenants:
                continue
            score = sum(w * vec.get(t, 0.0) for t, w in q.items())
            if score > 0:
                scored.append((score, ch))
        scored.sort(key=lambda s: (-s[0], s[1]["doc_id"]))
        return scored[:top_k]


@cache
def _index(chunk_size: int) -> TfidfIndex:
    chunks = [c for doc in load_documents() for c in chunk(doc, chunk_size)]
    return TfidfIndex(chunks)


# ---- context construction and generation -----------------------------------


def build_context(hits: List[Tuple[float, Dict[str, str]]], max_chars: int) -> Tuple[List[Dict[str, Any]], bool]:
    contexts, used, truncated = [], 0, False
    for score, ch in hits:
        remaining = max_chars - used
        if remaining <= 0:
            truncated = True
            break
        text = ch["text"]
        if len(text) > remaining:
            text, truncated = text[:remaining], True
        contexts.append({"id": ch["doc_id"], "text": text, "score": round(score, 4)})
        used += len(text)
    return contexts, truncated


def generate(question: str, contexts: List[Dict[str, Any]], max_sentences: int = 2) -> str:
    q_terms = set(_terms(question))
    candidates = []
    for order, ctx in enumerate(contexts):
        for sentence in _SENT.split(ctx["text"]):
            overlap = len(q_terms & set(_terms(sentence)))
            if overlap:
                candidates.append((-overlap, order, sentence.strip()))
    if not candidates:
        return "I don't know based on the available documents."
    best = [s for _, _, s in sorted(candidates)[:max_sentences]]
    return " ".join(best)


def answer(
    case_input: Any,
    *,
    top_k: int = 3,
    chunk_size: int = 60,
    max_context_chars: int = 1200,
    apply_access_filter: bool = True,
    generator: str = "extractive",
) -> Dict[str, Any]:
    """Vouqis target: takes a question string or ``{"question", "tenant"}``."""
    if isinstance(case_input, dict):
        question, tenant = case_input["question"], case_input.get("tenant", "public")
    else:
        question, tenant = str(case_input), "public"

    allowed = {"public", tenant} if apply_access_filter else None
    hits = _index(int(chunk_size)).search(question, int(top_k), allowed)
    contexts, truncated = build_context(hits, int(max_context_chars))

    if generator == "freeform":
        text = "Our team is happy to help with that request and will follow up with details shortly."
    elif generator == "extractive":
        text = generate(question, contexts)
    else:
        raise ValueError(f"unknown generator {generator!r}")

    return {
        "answer": text,
        "contexts": contexts,
        "metadata": {"context_truncated": truncated, "tenant": tenant, "retrieved": len(hits)},
    }
