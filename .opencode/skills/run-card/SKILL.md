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

Use this skill for multi-step work that needs a clear execution contract. A run card is mandatory before any implementation and its completeness gates execution.

## Mandatory Fields

Every run card MUST contain all 17 fields defined in the Canonical Working Method. An incomplete run card must not be executed.

| # | Field | Description |
|---|-------|-------------|
| 1 | **Goal of the run** | What is to be achieved? |
| 2 | **Why necessary** | Which problem is being solved? |
| 3 | **Risk Tier** | LOW_LOCAL / MEDIUM_REVIEW / HIGH_HUMAN_GATE / CRITICAL_BLOCK |
| 4 | **Context Level** | COLD / WARM / HOT |
| 5 | **Source of Truth** | Issue number, run report path, or "local only" |
| 6 | **Scope** | Which files/modules will be touched? |
| 7 | **Out of Scope** | What is explicitly not touched? |
| 8 | **Hard Constraints** | Non-negotiable boundaries |
| 9 | **Non-Touch Areas** | Files/directories that must not be touched |
| 10 | **Involved Agents** | Which agents are involved? |
| 11 | **Verification Contract** | Link or embedded contract |
| 12 | **Red Tests** | List of red tests or exemption justification |
| 13 | **Test Matrix** | Which tests must run? |
| 14 | **Evidence Plan** | What evidence will be collected? |
| 15 | **Owner-Approval-Status** | Per gate: NOT_REQUESTED / PENDING / APPROVED / DENIED / EXPIRED |
| 16 | **Rollback Strategy** | How to undo changes |
| 17 | **Expected Completion Classification** | GREEN_SAFE / AMBER_REVIEW / RED_BLOCK / TOOL_GAP |

## Workflow

1. Determine Risk Tier and Context Level from the Context Manifest.
2. Define the goal and why it is necessary.
3. Capture scope, out-of-scope, hard constraints, and non-touch areas.
4. List involved agents.
5. Create the Verification Contract (desired behavior, acceptance criteria, red tests, regression tests, reality gate, evidence types, untestable assumptions).
6. List the test matrix and evidence plan.
7. Record owner-approval-status per gate.
8. Define rollback strategy.
9. Determine expected completion classification.
10. Record the run card before implementation begins. No execution without a complete run card.

## Inputs

- validated facts
- discovery report / Context Manifest
- manifest
- project constraints
- Risk Tier determination

## Outputs

- run card markdown (all 17 fields)
- test matrix
- evidence plan
- rollback plan
- completion classification expectation

## Security Boundaries

- do not invent scope
- do not hide unknowns
- do not mark untested work as complete
- do not execute with incomplete run card

## Completion Criteria

- all 17 mandatory fields are populated
- scope is explicit
- acceptance criteria are testable
- rollback path exists
- owner-approval-status is recorded per gate

