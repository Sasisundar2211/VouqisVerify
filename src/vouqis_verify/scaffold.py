"""``vouqis init``: write a starter suite and target file."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List

from .errors import VouqisError

RAG_TARGET = '''"""Vouqis Verify target for your RAG pipeline.

Call your real retriever and model here and return the dict below.
See docs/targets.md for the full output contract.
"""


def answer(question, top_k=4):
    # docs = my_retriever.search(question, k=top_k)
    # text = my_llm.generate(question, docs)
    # return {
    #     "answer": text,
    #     "contexts": [{"id": d.id, "text": d.text, "score": d.score} for d in docs],
    # }
    raise NotImplementedError("Edit vouqis_target.py: call your RAG pipeline and return answer + contexts.")
'''

RAG_SUITE = """name: my-rag
target:
  callable: vouqis_target.py:answer
  kwargs: {top_k: 4}
  timeout_s: 60

defaults:
  checks:
    - type: answer_present

compare:
  fail_on: [status, metric]

cases:
  # Replace with real questions and the ids of the documents that answer them.
  - id: example-question
    input: How many days do customers have to request a refund?
    checks:
      - type: contains
        value: 30 days
      - type: retrieval_recall
        expected_ids: [refund-policy]
        k: 4
      - type: groundedness
        min: 0.8
"""

AGENT_TARGET = '''"""Vouqis Verify target for your agent.

Run your agent here and return its final answer, every tool call (including
failed ones, with "error" set), and why it stopped. See docs/targets.md.
"""


def run(message, max_steps=8):
    # result = my_agent.run(message, max_steps=max_steps)
    # return {
    #     "answer": result.final_text,
    #     "tool_calls": [
    #         {"name": c.tool, "args": c.args, "result": c.output, "error": c.error} for c in result.calls
    #     ],
    #     "stop_reason": result.stop_reason,
    # }
    raise NotImplementedError("Edit vouqis_target.py: run your agent and return answer + tool_calls + stop_reason.")
'''

AGENT_SUITE = """name: my-agent
target:
  callable: vouqis_target.py:run
  timeout_s: 120

defaults:
  checks:
    - type: answer_present
    - type: no_tool_errors
    - type: max_repeated_calls
      value: 3

compare:
  fail_on: [status, metric]

cases:
  # Replace with real requests and the tool behavior you expect.
  - id: example-request
    input: I want a refund for order ORD-1001
    checks:
      - type: tool_sequence
        sequence: [lookup_order, issue_refund]
      - type: stop_reason
        value: final_answer
"""

TEMPLATES: Dict[str, Dict[str, str]] = {
    "rag": {"vouqis.yaml": RAG_SUITE, "vouqis_target.py": RAG_TARGET},
    "agent": {"vouqis.yaml": AGENT_SUITE, "vouqis_target.py": AGENT_TARGET},
}


def init_project(directory: Path, kind: str, force: bool = False) -> List[Path]:
    if kind not in TEMPLATES:
        raise VouqisError(f"Unknown template {kind!r}. Choose from: {', '.join(sorted(TEMPLATES))}.")
    files = TEMPLATES[kind]
    targets = [directory / name for name in files]
    existing = [p for p in targets if p.exists()]
    if existing and not force:
        names = ", ".join(str(p) for p in existing)
        raise VouqisError(f"Refusing to overwrite {names}. Pass --force to replace.")
    directory.mkdir(parents=True, exist_ok=True)
    for path, content in zip(targets, files.values(), strict=True):
        path.write_text(content, encoding="utf-8")
    return targets
