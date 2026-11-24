"""LangChain integration example for Vouqis Verify (requires ``pip install langchain-core``).

Shows the target mapping from docs/targets.md running on real LangChain
objects: a ``BaseRetriever`` subclass, a ``ChatPromptTemplate``, and a runnable
chain. The "model" is a ``RunnableLambda`` that quotes the first retrieved
sentence, so the example runs offline. Swap it for a chat model such as
``ChatOpenAI`` in your project; the target function stays the same.
"""

from __future__ import annotations

from typing import Any, Dict, List

from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.retrievers import BaseRetriever
from langchain_core.runnables import RunnableLambda

DOCS = [
    Document(
        page_content="Customers can request a refund within 30 days of delivery.", metadata={"source": "refund-policy"}
    ),
    Document(page_content="International shipping takes 7 to 14 business days.", metadata={"source": "shipping"}),
    Document(page_content="The warranty does not cover water damage.", metadata={"source": "warranty"}),
]


class KeywordRetriever(BaseRetriever):
    """Ranks documents by shared words with the query."""

    docs: List[Document]
    k: int = 2

    def _get_relevant_documents(self, query: str, *, run_manager: CallbackManagerForRetrieverRun) -> List[Document]:
        words = {w.strip("?.,").lower() for w in query.split() if len(w) > 3}
        scored = [(len(words & {w.strip(".,").lower() for w in d.page_content.split()}), d) for d in self.docs]
        return [d for score, d in sorted(scored, key=lambda s: -s[0]) if score > 0][: self.k]


PROMPT = ChatPromptTemplate.from_messages(
    [("system", "Answer only from the context.\n\nContext:\n{context}"), ("human", "{question}")]
)


def _offline_model(prompt_value: Any) -> str:
    system = prompt_value.to_messages()[0].content
    context = system.split("Context:\n", 1)[1].strip()
    return context.splitlines()[0] if context else "I don't know."


chain = PROMPT | RunnableLambda(_offline_model)


def answer(question: str, k: int = 2) -> Dict[str, Any]:
    """Vouqis target: the docs/targets.md LangChain mapping."""
    docs = KeywordRetriever(docs=DOCS, k=k).invoke(question)
    text = chain.invoke({"question": question, "context": "\n".join(d.page_content for d in docs)})
    return {
        "answer": text,
        "contexts": [{"id": d.metadata.get("source"), "text": d.page_content} for d in docs],
    }
