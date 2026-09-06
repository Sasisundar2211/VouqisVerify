// Deterministic, rules-based AI-change classifier.
//
// It looks only at the PR title and changed file paths (never file contents)
// and matches them against fixed keyword lists per category. This mirrors
// the classification rules in project.md §7.
//
// ponytail: matching is substring-based on a lowercased "title + paths" blob
// rather than a real tokenizer/AST-aware path parser. That is enough to
// separate the 6 required demo categories correctly; upgrade to word-boundary
// or path-segment matching if real-world PR titles start producing false
// positives (e.g. a filename that merely contains "model" as a substring of
// an unrelated word).

import type { Category, Classification, Confidence, PullRequest } from "./types";

const KEYWORDS: Record<Exclude<Category, "NONE" | "NEEDS_HUMAN_REVIEW">, string[]> = {
  PROMPT: [
    "prompt",
    "prompts",
    "instruction",
    "instructions",
    "template",
    "templates",
    "system_prompt",
    "prompt_template",
    ".prompt",
    ".prompt.md",
    ".prompt.yaml",
    ".prompt.yml",
  ],
  MODEL_CONFIGURATION: [
    "model",
    "models",
    "provider",
    "providers",
    "llm",
    "openai",
    "anthropic",
    "temperature",
    "max_tokens",
    "max-tokens",
    "token_budget",
  ],
  RETRIEVAL_ACCESS: [
    "retrieval",
    "retriever",
    "vector",
    "embedding",
    "rerank",
    "reranker",
    "index",
    "indexes",
    "search",
    "filter",
    "filters",
    "top_k",
    "top-k",
    "routing",
    "access",
    "acl",
    "authorization",
    "allowlist",
    "tenant_filter",
    "tenant-filter",
  ],
  TOOL_PERMISSION: [
    "tool",
    "tools",
    "capability",
    "capabilities",
    "permission",
    "permissions",
    "allowed_tools",
    "allowed-tools",
    "tool_registry",
    "tool-registry",
    "mcp",
    "schema",
    "schemas",
  ],
};

// A dependency manifest/lockfile touched on its own is never a model-config
// signal, even if a provider name (e.g. "openai") appears in the PR title.
const DEPENDENCY_ONLY_FILES = ["package.json", "pnpm-lock.yaml", "yarn.lock", "package-lock.json"];

function isDependencyOnlyChange(changedFiles: string[]): boolean {
  return (
    changedFiles.length > 0 &&
    changedFiles.every((file) => DEPENDENCY_ONLY_FILES.some((name) => file.toLowerCase().endsWith(name)))
  );
}

/** Distinct keyword hits for one category, against the combined haystack. */
function matchedKeywords(haystack: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => haystack.includes(keyword));
}

export function classifyPullRequest(pr: PullRequest): Classification {
  if (isDependencyOnlyChange(pr.changedFiles)) {
    return {
      category: "NONE",
      confidence: "NONE",
      reason: "Only a dependency manifest/lockfile changed; not treated as a model configuration change.",
    };
  }

  const haystack = `${pr.title} ${pr.body} ${pr.changedFiles.join(" ")}`.toLowerCase();

  const matches = (Object.keys(KEYWORDS) as Array<keyof typeof KEYWORDS>).map((category) => ({
    category,
    keywords: matchedKeywords(haystack, KEYWORDS[category]),
  }));

  const withHits = matches.filter((m) => m.keywords.length > 0);

  if (withHits.length === 0) {
    return {
      category: "NONE",
      confidence: "NONE",
      reason: "No matching AI-change keywords found in the title or changed file paths.",
    };
  }

  const topHitCount = Math.max(...withHits.map((m) => m.keywords.length));
  const topMatches = withHits.filter((m) => m.keywords.length === topHitCount);

  if (topMatches.length > 1) {
    const summary = topMatches
      .map((m) => `${m.category} (matched: ${m.keywords.join(", ")})`)
      .join(" vs. ");
    return {
      category: "NEEDS_HUMAN_REVIEW",
      confidence: "LOW",
      reason: `Conflicting signals of equal strength: ${summary}. Needs human review.`,
    };
  }

  const winner = topMatches[0];
  const confidence: Confidence = topHitCount >= 2 ? "HIGH" : "MEDIUM";
  return {
    category: winner.category,
    confidence,
    reason: `Matched keyword${winner.keywords.length > 1 ? "s" : ""}: ${winner.keywords.join(", ")}`,
  };
}
