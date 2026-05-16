---
name: read-before-sketch
description: Enforces a read-first workflow before architecture, API, SDK, provider, security, CI/CD, MCP, data-model, external-tool, or other non-trivial implementation work. Use when a task needs repo context, issue context, or current official documentation before planning or coding.
license: MIT
compatibility: opencode
metadata:
  audience: all
  workflow: planning
---

# Read Before Sketch

Use this skill when a task is non-trivial or touches external systems, integrations, or structure.

## Workflow

1. Read the relevant instructions and the full task context.
2. Read the linked issue or spec in full.
3. Read affected repo files, tests, and docs.
4. Check current official docs when APIs, SDKs, providers, MCP, or security are involved.
5. Summarize validated facts and explicit uncertainties.
6. Then sketch the plan or implement the change.
7. Run appropriate checks or explain why they could not run.

## Scope

Use this skill for architecture, APIs, SDKs, providers, security, data models, CI/CD, MCP, external tools, benchmarks, and similar changes.

Do not use it for small formatting fixes, typo fixes, or purely local refactors that need no external validation.
