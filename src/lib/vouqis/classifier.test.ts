import { describe, expect, it } from "vitest";
import { classifyPullRequest } from "./classifier";
import type { PullRequest } from "./types";

function pr(overrides: Partial<PullRequest>): PullRequest {
  return {
    number: 1,
    title: "Untitled change",
    body: "",
    url: "https://github.com/acme-ai/customer-support-agent/pull/1",
    author: "test-author",
    mergedAt: "2026-08-01",
    changedFiles: [],
    ...overrides,
  };
}

describe("classifyPullRequest", () => {
  it("classifies prompt/instruction changes", () => {
    const result = classifyPullRequest(
      pr({
        title: "Rewrite support escalation system prompt for tone consistency",
        changedFiles: ["prompts/support/system_prompt.md", "prompts/support/escalation.prompt.md"],
      }),
    );
    expect(result.category).toBe("PROMPT");
    expect(result.confidence).toBe("HIGH");
    expect(result.reason).toMatch(/prompt/i);
  });

  it("classifies model configuration changes", () => {
    const result = classifyPullRequest(
      pr({
        title: "Switch default LLM provider from OpenAI to Anthropic",
        changedFiles: ["src/lib/llm/provider.ts", "config/model.yaml"],
      }),
    );
    expect(result.category).toBe("MODEL_CONFIGURATION");
    expect(result.confidence).toBe("HIGH");
  });

  it("does not classify a plain dependency bump as model configuration", () => {
    const result = classifyPullRequest(
      pr({
        title: "Bump openai package from 1.2.0 to 1.3.0",
        changedFiles: ["package.json", "pnpm-lock.yaml"],
      }),
    );
    expect(result.category).toBe("NONE");
    expect(result.reason).toMatch(/dependency/i);
  });

  it("classifies retrieval/access changes", () => {
    const result = classifyPullRequest(
      pr({
        title: "Tune retrieval top_k and add reranker for FAQ index",
        changedFiles: ["src/lib/retrieval/reranker.ts", "config/retrieval_filters.yaml"],
      }),
    );
    expect(result.category).toBe("RETRIEVAL_ACCESS");
    expect(result.confidence).toBe("HIGH");
  });

  it("classifies agent tool/permission changes", () => {
    const result = classifyPullRequest(
      pr({
        title: "Add MCP capability for calendar tool permission",
        changedFiles: ["src/agent/mcp/capability.ts"],
      }),
    );
    expect(result.category).toBe("TOOL_PERMISSION");
    expect(result.confidence).toBe("HIGH");
  });

  it("classifies unrelated changes as NONE", () => {
    const result = classifyPullRequest(
      pr({
        title: "Fix button hover color on dashboard",
        changedFiles: ["src/components/Button.tsx", "src/styles/button.css"],
      }),
    );
    expect(result.category).toBe("NONE");
    expect(result.confidence).toBe("NONE");
  });

  it("classifies based on keywords found only in the PR body", () => {
    const result = classifyPullRequest(
      pr({
        title: "Housekeeping",
        body: "Adjusts the model temperature and max_tokens for the summarizer.",
        changedFiles: ["src/lib/summarize.ts"],
      }),
    );
    expect(result.category).toBe("MODEL_CONFIGURATION");
  });

  it("flags conflicting equal-strength signals for manual review", () => {
    const result = classifyPullRequest(
      pr({
        title: "Update routing and permission logic for support ticket handler",
        changedFiles: ["src/lib/handler/routing.ts", "src/lib/handler/permission_check.ts"],
      }),
    );
    expect(result.category).toBe("NEEDS_HUMAN_REVIEW");
    expect(result.reason).toMatch(/conflicting/i);
  });
});
