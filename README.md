# Vouqis Verify

Catch silent failures and regressions in RAG and AI agent workflows before you ship.

You change a prompt, a model, a retriever setting, or an agent tool. The workflow still returns HTTP 200 and still produces fluent text. Did retrieval drop a document? Did a tenant filter stop working? Did the agent skip a policy check, or swallow a tool error and report success anyway?

Vouqis Verify runs your workflow on a fixed set of cases, checks each output, saves the run as a baseline, and on the next change tells you exactly which cases regressed and why. It runs locally and in CI, and returns an exit code your pipeline understands.

```text
$ vouqis run examples/agent/vouqis.yaml --baseline baseline.json -T swallow_tool_errors=true

  PASS  refund-eligible-order  (0 ms)
  ...
  FAIL  unknown-order-not-refunded  (0 ms)
      X  tool_not_called: 'issue_refund' called 1 time(s), expected 0
      X  not_contains: answer contains forbidden value(s): ['has been issued']
      X  contains: answer is missing: ['not found']

Baseline comparison: 1 error(s), 2 warning(s)
  ERROR   [status] unknown-order-not-refunded: regressed: passed in baseline, fails now (...)
  WARNING [drift] unknown-order-not-refunded: tool sequence changed ['lookup_order'] -> ['lookup_order', 'check_refund_eligibility', 'issue_refund']

RESULT: FAILED
```

That run caught an agent that "succeeded" (no exception, `stop_reason: final_answer`) while every tool call had failed and it told the customer a refund was issued.

## Install

```sh
pip install git+https://github.com/Sasisundar2211/VouqisVerify
```

After the first PyPI release this becomes `pip install vouqis-verify`. Python 3.9 or newer. One runtime dependency: PyYAML.

## Quick start

1. Wrap your workflow in a function that takes one input and returns a dict:

   ```python
   # my_rag.py
   def answer(question, top_k=4):
       docs = retriever.search(question, k=top_k)          # your retriever
       text = llm.generate(prompt(question, docs))         # your model call
       return {
           "answer": text,
           "contexts": [{"id": d.id, "text": d.text, "score": d.score} for d in docs],
       }
   ```

2. Describe cases and checks in `vouqis.yaml`:

   ```yaml
   name: support-rag
   target:
     callable: my_rag.py:answer
     kwargs: {top_k: 4}
   cases:
     - id: refund-window
       input: How many days do customers have to request a refund?
       checks:
         - {type: contains, value: 30 days}
         - {type: retrieval_recall, expected_ids: [refund-policy], k: 4}
         - {type: groundedness, min: 0.8}
   ```

3. Record a baseline on known-good code, then verify every change against it:

   ```sh
   vouqis run vouqis.yaml --save-baseline vouqis-baseline.json   # on main
   vouqis run vouqis.yaml --baseline vouqis-baseline.json         # on your branch
   ```

Exit code 0 means verified. 1 means a check failed or a regression was found. 2 means a usage or configuration error.

## What it detects

| Area | Examples of checks | Catches |
| --- | --- | --- |
| Answers | `answer_present`, `contains`, `not_contains`, `regex`, `json_valid`, `equals` | Empty outputs, missing facts, leaked strings, broken structured output |
| Retrieval | `retrieval_recall`, `retrieval_precision`, `retrieval_mrr`, `context_contains`, `max_context_chars` | Dropped documents, ranking regressions, truncated context |
| Access control | `context_excludes_ids`, `not_contains` | Cross-tenant and permission leaks in retrieval |
| Grounding | `groundedness` (heuristic) | Answers not supported by retrieved context |
| Agent tools | `tool_called`, `tool_not_called`, `tool_sequence`, `tool_args`, `tool_args_required` | Skipped steps, wrong order, bad arguments, forbidden tools |
| Agent execution | `no_tool_errors`, `max_repeated_calls`, `max_tool_calls`, `stop_reason` | Swallowed errors, retry loops, runaway steps, wrong termination |
| Execution | `max_latency_ms`, timeouts, exceptions, invalid output shape | Crashes and hangs reported as failures, never as passes |

Against a baseline it also reports metric drops (recall, MRR, groundedness, pass rate), answer drift, tool-sequence changes, retrieved-context changes, and latency growth. Run `vouqis checks` for the full list.

Deterministic and heuristic results are labeled separately. `groundedness` and answer-drift similarity are lexical heuristics, not model judgments. Treat them as signals and set thresholds from your own baseline.

## Try the reference workflows

The repo includes a complete offline RAG pipeline (chunking, TF-IDF retrieval with a tenant filter, context budget, extractive generation) and a tool-using agent (lookup, eligibility check, refund, shipping with retries). Each has knobs that reproduce real regressions:

```sh
pip install -e .
vouqis run examples/rag/vouqis.yaml --save-baseline /tmp/rag.json
vouqis run examples/rag/vouqis.yaml --baseline /tmp/rag.json -T top_k=1                    # recall drop
vouqis run examples/rag/vouqis.yaml --baseline /tmp/rag.json -T apply_access_filter=false  # tenant leak
vouqis run examples/rag/vouqis.yaml --baseline /tmp/rag.json -T generator='"freeform"'     # ungrounded answers

vouqis run examples/agent/vouqis.yaml --save-baseline /tmp/agent.json
vouqis run examples/agent/vouqis.yaml --baseline /tmp/agent.json -T skip_eligibility_check=true
vouqis run examples/agent/vouqis.yaml --baseline /tmp/agent.json -T max_retries=0
```

Both examples run without network access or API keys. They stand in for your real pipeline; they are not LLM-backed.

## GitHub Actions

```yaml
- uses: Sasisundar2211/VouqisVerify@main
  with:
    suite: vouqis.yaml
    baseline: vouqis-baseline.json
    install: -r requirements.txt
```

The action writes a Markdown report to the job summary and fails the job on regressions. See [docs/ci.md](docs/ci.md) for baseline strategies, JUnit output, and secrets handling.

## Documentation

- [Configuration reference](docs/configuration.md)
- [Check reference](docs/checks.md)
- [Writing a target](docs/targets.md): output contract and wrapping LangChain, LlamaIndex, or custom agents
- [CI integration](docs/ci.md)
- [Architecture](docs/architecture.md)
- [Troubleshooting](docs/troubleshooting.md)

## Limitations

- Vouqis Verify does not call an LLM. There is no model-graded evaluation. Semantic checks are lexical heuristics.
- A timed-out target keeps running in a background thread until the process exits, because Python cannot kill threads.
- Cases run one after another in a single process.
- LLM outputs vary between runs. Use `repeat` with `min_pass_rate`, assert on facts rather than exact wording, and treat drift findings as warnings unless your workflow is deterministic.

## Project

- License: [Apache-2.0](LICENSE)
- [Contributing](CONTRIBUTING.md), [Security policy](SECURITY.md), [Changelog](CHANGELOG.md)
- The previous Next.js "AI Change Evidence Pack" web app is preserved in [legacy/evidence-pack-web](legacy/evidence-pack-web) and is no longer maintained.
