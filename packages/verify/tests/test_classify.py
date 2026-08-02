from vouqis_verify.core.classify import classify_kind


def test_prompt_kind():
    assert classify_kind("prompts/system.txt") == "Prompt"


def test_agent_kind():
    assert classify_kind("src/agents/chat.py") == "Agent"


def test_rag_kind():
    assert classify_kind("rag/index.py") == "RAG"


def test_retrieval_keyword_maps_to_rag():
    assert classify_kind("src/retrieval/store.py") == "RAG"


def test_tool_kind():
    assert classify_kind("tools/search.py") == "Tool"


def test_evaluation_kind():
    assert classify_kind("evals/regression.py") == "Evaluation"


def test_model_kind():
    assert classify_kind("models/config.yaml") == "Model"


def test_unmatched_path_falls_back_to_ai():
    assert classify_kind("packages/verify/vouqis_verify/report/render.py") == "AI"


def test_first_matching_keyword_wins():
    # contains both "rag" and "tool" — "rag" rule is listed before "tool"
    assert classify_kind("rag/tools/retriever.py") == "RAG"


def test_case_insensitive():
    assert classify_kind("PROMPTS/System.txt") == "Prompt"
