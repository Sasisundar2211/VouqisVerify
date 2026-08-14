# Vouqis Verify Product Scope

Vouqis Verify is a Python-based developer tool that helps engineering teams review AI-related pull requests before they reach production.

**Positioning:** CI for AI behavior. Give reviewers proof of what an AI pull request changes before it reaches production.

## Core questions

Every AI-related pull request raises the same questions for a reviewer. Vouqis Verify's job is to answer as many of them as the current evidence allows, and to say plainly when it can't:

1. What changed?
2. Which AI behavior could be affected?
3. What evidence was evaluated?
4. What improved or regressed?
5. Which scenarios are affected?
6. What evidence is missing?
7. Does the change satisfy the team's merge policy?

The v0.1 MVP answers questions 1, 2, 3, 6 (partially — see below), and 7. Questions 4 and 5 require score/behavioral-diff capability the MVP does not have yet (see [roadmap](roadmap.md)).

## Core workflow

The product loads `vouqis.yml`, detects AI-related changes through Git diff analysis, runs the team's configured evaluation suite, collects the results, and generates a structured Review Package with a merge recommendation.

## Verdicts

- **BLOCK MERGE:** evaluation failed.
- **MERGE WITH WARNING:** evaluation passed but AI-related files changed, or the repository diff could not be determined.
- **SAFE TO MERGE:** evaluation passed and no AI-related files changed.

**Safety rule:** `diff_failed` must never produce `SAFE TO MERGE`.

## MVP stack

Python, Git, pytest or configurable evaluation commands, GitHub Actions, GitHub PR integration, and CLI terminal and JSON output.

## Users

AI engineers, backend and platform engineers, AI infrastructure teams, and technical teams building AI applications, agents, RAG systems, and tool integrations.

## Stage

Vouqis Verify is an early MVP in customer discovery. The workflow is being validated with design partners; the project makes no claims of production-scale adoption, customer traction, or measured time savings.

## Non-goals

Vouqis Verify is not:

- an AI code reviewer, or a Copilot/Cursor-style coding agent
- a generic observability or LLM tracing platform
- an evaluation platform competing with Langfuse, LangSmith, or similar
- a general-purpose CI replacement
- a dashboard-first SaaS product

It sits at the merge-decision layer: it converts evidence that already exists (your tests, your evals, your diff) into a reviewable recommendation. It does not generate that evidence for you.

## Repository boundary

This repository contains only the Vouqis Verify MVP and its core engineering infrastructure.
No separate dashboards, landing pages, marketing websites, unrelated prototypes, or deprecated product packages belong here.
