---
name: run-card
description: Builds a validated run card with scope, acceptance criteria, tests, risks, and rollback.
license: MIT
compatibility: opencode
metadata:
  audience: bootstrap
  workflow: planning
  hermes: compatible
---

## When To Use

Use this skill for multi-step work that needs a clear execution contract.

## Workflow

1. Define the goal and non-goals.
2. Capture the acceptance criteria.
3. List the test matrix.
4. Identify risks and rollback steps.
5. Record the run card before implementation begins.

## Inputs

- validated facts
- discovery report
- manifest
- project constraints

## Outputs

- run card markdown
- test matrix
- risk matrix
- rollback plan

## Security Boundaries

- do not invent scope
- do not hide unknowns
- do not mark untested work as complete

## Completion Criteria

- scope is explicit
- acceptance criteria are testable
- rollback path exists

