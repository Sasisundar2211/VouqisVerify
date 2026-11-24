# Writing a target

A target is a Python function. Vouqis Verify calls it once per case invocation and checks what it returns.

```python
def answer(case_input, **kwargs) -> dict | str: ...
```

## Output contract

Return a string (treated as `{"answer": "..."}`) or a dict with any of these keys:

| Key | Type | Used by |
| --- | --- | --- |
| `answer` | string or null | Answer checks, groundedness, answer drift |
| `contexts` | list of strings or of `{id, text, score}` | Retrieval checks, groundedness, context drift |
| `tool_calls` | list of `{name, args, result, error}` | Agent checks, tool-sequence drift |
| `stop_reason` | string or null | `stop_reason` |
| `metadata` | dict | `metadata_equals` |

Accepted aliases: a context's `text` may be named `page_content` or `content`. A tool call's `args` may be named `arguments`. Context ids become strings. Tool errors become strings. Extra top-level keys merge into `metadata`.

Anything else fails the invocation with `InvalidOutput` and a message naming the bad field. Values must be JSON-serializable to save a baseline; anything else is saved with `str()`.

## Return what the model saw

Return the contexts after reranking, filtering, and truncation: the text that reached the prompt. Returning raw retriever results hides context-construction bugs.

Pick the `id` granularity you assert on. Document ids keep expected ids stable when you change chunking. Chunk ids let you assert on exact chunks, and every chunking change then shows up as drift.

## Record tool errors instead of hiding them

Append a tool call with `error` set whenever a tool fails, including failures your agent retries or recovers from. `no_tool_errors` and `max_repeated_calls` depend on it. An agent that catches an exception and moves on without recording it is the silent failure this tool exists to catch.

## Wrapping a framework

Vouqis Verify has no framework-specific integration. Convert the framework's result into the dict above. The sketches below show the field mapping. They are untested against those libraries; check attribute names for your installed version.

LangChain retriever plus chain:

```python
def answer(question, k=4):
    docs = retriever.invoke(question)[:k]
    text = chain.invoke({"question": question, "context": docs})
    return {
        "answer": text,
        "contexts": [{"id": d.metadata.get("source"), "text": d.page_content} for d in docs],
    }
```

LlamaIndex query engine:

```python
def answer(question):
    response = query_engine.query(question)
    return {
        "answer": str(response),
        "contexts": [{"id": n.node.node_id, "text": n.node.get_content(), "score": n.score}
                     for n in response.source_nodes],
    }
```

Custom agent loop:

```python
def run(message, max_steps=8):
    trace = []
    for step in agent.stream(message, max_steps=max_steps):
        if step.kind == "tool":
            trace.append({"name": step.tool, "args": step.args, "result": step.output, "error": step.error})
    return {"answer": agent.final_text, "tool_calls": trace, "stop_reason": agent.stop_reason}
```

## Nondeterminism and cost

Every invocation runs your real workflow, including real model calls and their cost. For LLM-backed targets:

- Set `temperature: 0` or a fixed seed through `kwargs` where your provider supports it.
- Assert on facts (`contains`, retrieval ids, tool sequence) rather than exact wording.
- Use `repeat` with `min_pass_rate` for cases that vary between runs.
- Keep `drift` out of `fail_on` unless your workflow is deterministic.

Secrets stay in your environment. Vouqis Verify reads none of them, but it saves whatever your target returns, so keep credentials out of outputs and metadata.
