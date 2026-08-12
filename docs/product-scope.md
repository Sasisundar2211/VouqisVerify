# Vouqis Verify Product Scope

Vouqis Verify is a Python-based developer tool that helps engineering teams review AI-related pull requests before they reach production.

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

## Repository boundary

This repository contains only the Vouqis Verify MVP and its core engineering infrastructure.
No separate dashboards, landing pages, marketing websites, unrelated prototypes, or deprecated product packages belong here.
