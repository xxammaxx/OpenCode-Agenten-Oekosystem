---
name: spec-driven-development
description: Enforces the risk-based Speckit workflow. The intensity of specification depends on the Risk Tier. Verification Contract is mandatory for ALL implementable tiers. Blocks premature implementation. Ecosystem Convention — not a built-in OpenCode feature.
license: MIT
compatibility: opencode
metadata:
  audience: issue-orchestrator
  workflow: speckit
---

## Core Principle

No implementation without a specification. The Speckit workflow intensity is determined by the **Risk Tier** (see WORKING-METHOD.md). This is an **Ecosystem Convention** — the `/speckit.*` commands are a naming convention defined by this ecosystem, not a built-in OpenCode feature.

## Risk-Based Speckit Workflow

| Risk Tier | Speckit Scope | Verification Contract |
|-----------|---------------|----------------------|
| **LOW_LOCAL** | Lightweight Spec (goal, scope, acceptance criteria only) | Mandatory |
| **MEDIUM_REVIEW** | Spec + Plan + Tasks | Mandatory |
| **HIGH_HUMAN_GATE** | Full Speckit (Constitution → Specify → Plan → Tasks) + GitHub Issues | Mandatory |
| **CRITICAL_BLOCK** | ❌ No implementation until blocker is resolved | N/A |

## Speckit Phases (Full — for HIGH_HUMAN_GATE)

### Phase 1: Constitution
- Define project principles and constraints
- Document non-negotiable rules
- Output: constitution document

### Phase 2: Specify
- Write formal specification for the feature
- Define user stories with acceptance criteria
- Document edge cases and error states
- Output: specification document

### Phase 3: Plan
- Create implementation plan
- Identify affected modules and files
- Estimate complexity and dependencies
- Output: plan document

### Phase 4: Tasks
- Break plan into atomic, testable tasks
- Order by dependency
- Estimate each task
- Output: task list

### Phase 5: Tasks to Issues (GitHub only)
- Convert tasks to GitHub Issues when GitHub is available
- Link parent/child relationships
- Assign labels and milestones
- Output: GitHub Issues created (optional, only when GitHub available)

### Phase 6: Implement
- ONLY NOW can implementation begin
- Work through issues/tasks in dependency order
- Each task follows the Verification Contract workflow

## Lightweight Spec (for LOW_LOCAL)

For LOW_LOCAL tasks, only these fields are required:
1. **Goal**: What is to be achieved?
2. **Scope**: Which files/modules are affected?
3. **Acceptance Criteria**: Testable conditions for completion
4. **Verification Contract**: Desired behavior + acceptance criteria + tests

## Verification Contract (Mandatory for ALL Tiers)

Every implementable task requires a Verification Contract with these fields:

| Field | Description | Example |
|-------|-------------|---------|
| **Desired Behavior** | What should the system do after the change? | "After the API call, status is set to 'active'" |
| **Acceptance Criteria** | Testable completion conditions | "Status field is 'active' within 5 seconds of call" |
| **Red Tests** | Tests that fail before implementation | "test_create_sets_active_status" |
| **Regression Tests** | Existing tests that must remain green | "test_existing_queries_still_work" |
| **Reality Gate** | How to verify the change is correct in the repo | "git diff --stat", "node scripts/validate.mjs" |
| **Evidence Types** | What evidence is expected? | "Log output of API call", "Screenshot of UI" |
| **Untestable Assumptions** | What cannot be tested? Mark explicitly | "Assumption: third-party API is available" |

## Gate Validation

Before Phase 6 (or before implementation for lower tiers):
- [ ] Specification exists and has acceptance criteria
- [ ] Verification Contract is complete
- [ ] Risk Tier is correctly assessed
- [ ] Plan covers all specification items (MEDIUM_REVIEW+)
- [ ] Tasks are atomic and testable (MEDIUM_REVIEW+)
- [ ] GitHub Issues are created and linked (HIGH_HUMAN_GATE only, when GitHub available)
- [ ] Security consideration documented
- [ ] Data model changes validated (if applicable)

## Prohibited

- Writing implementation code before specification is complete
- Skipping phases (must be sequential for the chosen tier)
- Implementing features not in specification
- Proceeding with incomplete acceptance criteria
- Proceeding without a Verification Contract (any implementable tier)
- Claiming Speckit is a built-in OpenCode feature (it is an Ecosystem Convention)
