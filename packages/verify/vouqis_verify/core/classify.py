from __future__ import annotations

# Order matters: first matching keyword wins. Pure string matching, no AI.
_KIND_RULES: list[tuple[str, str]] = [
    ("prompt", "Prompt"),
    ("agent", "Agent"),
    ("retrieval", "RAG"),
    ("rag", "RAG"),
    ("tool", "Tool"),
    ("eval", "Evaluation"),
    ("model", "Model"),
]


def classify_kind(filepath: str) -> str:
    """Classify a changed file into an AI-change kind via path keywords."""
    lower = filepath.lower()
    for keyword, kind in _KIND_RULES:
        if keyword in lower:
            return kind
    return "AI"
