---
name: verification-contract
description: Defines and enforces a verification contract for every task. Requires explicit desired behavior, acceptance criteria, red tests, regression tests, reality gate criteria, evidence types, and untestable assumptions before implementation can be claimed complete.
license: MIT
compatibility: opencode
metadata:
  hermes: compatible
  risk_tier: all
  audience: issue-orchestrator
  workflow: verification
---

## When To Use

Use this skill **before implementation begins** — mandatory for all risk tiers.

Every task, regardless of size or severity, must have a Verification Contract before implementation can be claimed complete. This skill ensures that no agent can mark a task as done without first explicitly defining:

- What correct behavior looks like
- How correctness will be proven
- What cannot be proven and why
- Which gates must pass before DONE is declared

## Workflow

Execute these 7 steps in order before any implementation begins:

### Step 1: Define Desired Behavior
State concisely what the system should do after the change. This is the behavioral north star. Write it in plain language that a reviewer or non-technical stakeholder can understand.

### Step 2: Define Acceptance Criteria
Write testable, measurable conditions that must be true for the task to be complete. Each criterion must be falsifiable — it must be possible to write a test that fails when the criterion is not met.

**Bad:** "The system should be fast."
**Good:** "The /api/search endpoint returns results in under 500ms for queries with fewer than 10 tokens."

### Step 3: Define Red Tests
Write or describe tests that currently fail (RED) and will pass (GREEN) once the implementation is correct. These are the primary evidence that the behavioral gap has been closed. See the **Red Tests Section** below for details and exceptions.

### Step 4: Define Regression Tests
Identify existing tests that must continue to pass after the change. If no existing regression tests are relevant, state that explicitly. Do not skip this step — "no regression risk" is a positive claim that must be documented.

### Step 5: Define Reality Gate
Describe how the change will be verified in the actual runtime environment (not just the test suite). This could be a manual check, a smoke test, a staging deployment, a visual inspection, or a production canary. See the **Reality Gate** section below.

### Step 6: Declare Evidence Types
Specify exactly what evidence will be collected to prove correctness. Different evidence types have different reliability. Prefer automated, machine-readable, and auditable evidence over human observation. See the **Evidence Types** section below.

### Step 7: Declare Untestable Assumptions
State explicitly what cannot be tested and why. Every implementation has untestable edges. The contract must surface them so reviewers can decide whether the risk is acceptable. Common examples: platform-specific behavior, race conditions under extreme load, third-party API behavior that cannot be mocked realistically.

---

## Verification Contract Template

Use this template for every task. Fill all fields. Leave no section blank — if a section has no entries, write "None" explicitly.

```markdown
## Verification Contract

### Desired Behavior
(What should happen — plain language, actionable)

### Acceptance Criteria
(Testable conditions — each one must be verifiable)

1. 
2. 
3. 

### Red Tests
(Tests that currently fail, demonstrating the gap — one per file/behavior)

1. 
2. 
3. 

### Regression Tests
(Tests that must continue to pass — existing test names or paths)

1. 
2. 
3. 

### Reality Gate
(How to verify in actual runtime — not just test suite)

### Evidence Types
(What evidence will prove correctness — logs, screenshots, diff, test output, etc.)

| Evidence Type | Source | How Collected |
|---------------|--------|---------------|
|               |        |               |

### Untestable Assumptions
(What cannot be tested and why — be honest)

| Assumption | Why Untestable | Risk if Wrong |
|------------|----------------|---------------|
|            |                |               |

### Completion Claim Gate
(All gates that must pass before claiming DONE)

- [ ] All acceptance criteria met
- [ ] Red tests passing (GREEN)
- [ ] Regression tests passing
- [ ] Reality gate passed
- [ ] Evidence collected and attached
- [ ] Reviewer approved
```

---

## Red Tests Section

A **red test** is a test that currently fails because the desired behavior does not yet exist. Implementation is complete when the test passes (RED → GREEN).

### Rules

1. Every acceptance criterion should have at least one corresponding red test.
2. The red test must be written or at least specified **before** implementation begins.
3. The test must be deterministic — it fails consistently in the absence of the fix.
4. Once the implementation makes it pass, that passing status is primary evidence.

### Exceptions

Red tests may be omitted only in these cases:

| Exception | When It Applies | Required Documentation |
|-----------|----------------|-----------------------|
| **Structural-only changes** | Refactoring, renaming, moving files — no behavioral change | State "structural-only: no behavioral change" and reference the green test suite |
| **Untestable codebases** | The project has no test framework and adding one is out of scope | Document in Untestable Assumptions with a plan to add tests later |
| **Disproportionate effort** | Writing a red test would cost more than the fix itself (e.g., complex integration environment not reproducible in test harness) | Document the effort estimate and get explicit reviewer acknowledgment |

When red tests are omitted, the **Reality Gate** becomes the primary verification mechanism.

---

## Reality Gate

The reality gate verifies the change in an actual runtime environment, not just the test suite. This catches environment-specific bugs, integration gaps, and configuration issues that unit tests miss.

### Common Reality Gates

| Gate Type | Description | Example |
|-----------|-------------|---------|
| **Manual smoke test** | Human runs the application and checks the behavior | "Open the /dashboard page and confirm the new widget renders with correct data" |
| **Automated smoke test** | Scripted end-to-end check in a staging environment | "Playwright test that navigates to /dashboard and asserts widget content" |
| **Staging deployment** | Deploy to staging, run integration checks, verify logs | "Deploy to staging, run curl against /api/search with known query, verify response shape and timing" |
| **Production canary** | Gradual rollout with monitoring | "Deploy to 5% of production instances, monitor error rate for 15 minutes" |
| **Visual comparison** | Screenshot diff against baseline | "Capture before/after screenshots of /profile page and diff them" |
| **Log inspection** | Check that specific log lines appear at the right time | "grep for 'payment.confirmed' in the application log after test transaction" |

### Requirements

1. The reality gate must be **reproducible** — someone else can follow the same steps and get the same result.
2. If the reality gate requires access the agent does not have (production, staging credentials), document the gap and flag it for human execution.

---

## Evidence Types

Each evidence type has a reliability tier. Prefer Tier 1 evidence whenever possible.

| Tier | Evidence Type | Reliability | Notes |
|------|---------------|-------------|-------|
| 1 | **Test output** (pass/fail, diff) | High | Deterministic, automated, auditable |
| 1 | **Log output** (structured, with timestamps) | High | Must include enough context to reconstruct the event |
| 1 | **Diff output** (git diff --stat, git diff) | High | Shows exactly what changed |
| 2 | **Screenshot** (with visible timestamp) | Medium | Subject to visual inspection; prefer automated screenshot diff |
| 2 | **Performance metrics** (latency p50/p95/p99, throughput) | Medium | Must include methodology and load conditions |
| 2 | **Error rate** (before/after comparison) | Medium | Must include time window and sample size |
| 3 | **Human observation** ("I tested it and it works") | Low | High risk of confirmation bias; only acceptable for reality gates when automated evidence is impossible |
| 3 | **Manual screen recording** | Low | Better than static screenshots but still human-gated |
| — | **Untestable assumptions** | No evidence | These are documented risks, not evidence. Never accept these as proof of correctness. |

### Evidence Collection Rules

1. Every evidence item must include a **source** (which command, which tool, which environment).
2. Evidence must be **attached to the task** (in an issue comment, report file, or run log).
3. Evidence must be **time-stamped** or include a commit hash so it can be correlated with a specific code state.
4. Log evidence must **redact secrets and PII** before attachment.

---

## Completion-Claim-Gate

No agent may mark a task as **DONE**, **COMPLETE**, **RESOLVED**, **FIXED**, or any equivalent status until **all** of the following gates have passed:

| Gate | Description | Who Verifies |
|------|-------------|-------------|
| **All acceptance criteria met** | Every criterion from the contract is satisfied | Agent + Reviewer |
| **Red tests passing** | Every red test now passes (GREEN) | Automated test run |
| **Regression tests passing** | All pre-existing relevant tests continue to pass | Automated test run |
| **Reality gate passed** | The runtime verification succeeded (or human gated) | Agent or Human |
| **Evidence collected** | All specified evidence types are attached to the task | Reviewer |
| **Reviewer approved** | A human or review-agent has signed off | Reviewer |

### If a gate fails

1. Do **not** modify the contract retroactively to match the behavior.
2. Return to implementation with the specific gate failure documented.
3. Only after all gates pass may the completion claim be made.

### Prohibited Claims

- "Works on my machine" without evidence
- "Trust me, I tested it" without a documented reality gate
- "The tests pass" when red tests were skipped or not written
- "All acceptance criteria are met" when some criteria are untestable and not documented as such

---

## Inputs

Before starting, the agent must have:

| Input | Required | Description |
|-------|----------|-------------|
| Task description | Yes | What needs to be done — from issue, ticket, or user request |
| Acceptance criteria | Yes | Concrete, testable conditions of success. If not provided, the agent must derive them from the task description and get approval |
| Existing tests | Yes | Any tests that currently exist for the affected area. If none exist, that is an untestable assumption |
| Runtime environment | Yes | Where the code will run — local dev, staging, production, CI. Determines which reality gates are feasible |

If any input is missing, the agent must either derive it from context and mark it as assumed, or flag the gap to a human.

---

## Outputs

After completing this skill, the agent must produce:

| Output | Required | Description |
|--------|----------|-------------|
| Filled verification contract | Yes | The template above with all sections populated |
| Red test list | Yes | List of tests that will be written or exist that currently fail. Empty list only with documented exception |
| Evidence plan | Yes | Which evidence types will be collected, from which sources, and how |

These outputs must be persisted (to an issue comment, a report file, or the task record) before implementation begins.

---

## Security Boundaries

These rules are non-negotiable:

1. **Never accept untestable claims as evidence.** "I'm confident it works" is not evidence. If the only evidence available is a claim that cannot be verified, the task must be flagged as **unverifiable** and escalated to a human.

2. **Never mark complete without gate pass.** The Completion Claim Gate is the final check. No gate may be skipped. If a gate cannot be evaluated (e.g., staging environment unavailable), that must be documented as an **unverifiable gate** and escalated.

3. **Always document untestable assumptions explicitly.** If something cannot be tested, that is a risk. Write it down. Include what could go wrong and how severe the impact would be. The reviewer decides whether the risk is acceptable, not the implementer.

4. **Never modify the contract after implementation begins.** If the contract is wrong, stop, update the contract, and restart from Step 1. Implementation under a flawed contract produces unreliable verification.

5. **External evidence must be attributable.** Logs must include timestamps and source identifiers. Screenshots must be capturable on demand. Evidence without provenance is not evidence.

---

## Completion Criteria

This skill is complete when:

- [ ] Verification Contract is filled with all sections populated (no blanks)
- [ ] All gates are defined in the Completion Claim Gate section
- [ ] Evidence types are specified with sources and collection methods
- [ ] Red tests are listed (or valid exception documented)
- [ ] Untestable assumptions are documented with risk assessment
- [ ] Contract is persisted before implementation begins
