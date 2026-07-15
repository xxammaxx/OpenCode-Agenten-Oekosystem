# Architecture: Canonical Working Method Layer

**Status:** Accepted

**Date:** 2026-07-15

**Deciders:** Architecture Agent (delegated from issue-orchestrator)

## Context

The Universal Bootstrap (PR #1) is technically `GREEN_SAFE`, but the agent working method is distributed across multiple documents (`AGENTS.md`, `evidence-gates.json`, `write-protection.json`, `mcp-trust-tiers.json`, 21 skills) with no single authoritative source. Key gaps identified in the deep-dive audit:

- No Cold/Warm/Hot Context Level definitions — agents can implement in Cold context without loading policies or issue data.
- No Hard-Constraint-Re-Injection after Context Compaction — critical safety rules can silently fall out of context.
- No Risk Tiers separate from MCP Trust Tiers — Speckit workflow is forced uniformly for all changes, creating friction for trivial edits and insufficient gates for critical ones.
- No Verification Contract — completion claims lack standardized, auditable acceptance criteria.
- No Red-Tests discipline — no structural requirement to prove a failure exists before claiming a fix.
- No Anti-Fake-Execution rules — hallucinated tool output is not systematically detected.
- No separate Owner Approval Gates — all irreversible operations share one amorphous gate (commit=ask, push=deny).
- No documented Non-Touch Areas beyond `write-protection.json` — agents lack a human-readable list of permanently forbidden files.
- Security-Compliance order inverted — Compliance (step 6) ran before Security (step 7).
- No `WORKING-METHOD.md` or `working-method.json` exists — no single human- or machine-readable workflow contract.

A unified, machine-auditable canonical workflow is needed as the single source of truth for all agent behavior.

## Decision

Implement a **Canonical Working Method Layer** as an additional layer on top of the existing Universal Bootstrap. The repository now serves five distinct roles:

1. **Universal Bootstrap** for OpenCode and Hermes Agent (existing)
2. **Canonical Workflow Contract** for coding agents (new)
3. **Machine-readable Policy Source** (new — `working-method.json`)
4. **Skill Library** for workflow modules (enhanced — 6 new skills, 6 updated)
5. **Living Truth Mirror** for code, evidence, and documentation (enhanced — 5 truth layers)

## Architecture Components

### Three-Layer Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Layer 3: Hermes Handoff (enhanced)                            │
│   YAML bundles, write-approval gates, memory-write gates      │
│   External skill directory guidance, gateway mode config      │
├──────────────────────────────────────────────────────────────┤
│ Layer 2: Canonical Working Method (new)                       │
│   WORKING-METHOD.md, working-method.json                      │
│   Context-Engineering, Risk-Tier-Routing, Verification-Contract│
│   Owner-Approval-Gate, Anti-Fake-Execution, Privacy-Data-Min  │
│   Updated: run-card, reality-refresh, spec-driven-development │
├──────────────────────────────────────────────────────────────┤
│ Layer 1: Universal Bootstrap (existing)                       │
│   Manifest-driven discovery, dry-run default, --apply         │
│   Conservative merge, provider/model preservation             │
│   Backup and rollback, conflict classification               │
└──────────────────────────────────────────────────────────────┘
```

### Layer 1: Universal Bootstrap (existing)

- Manifest-driven project discovery via `ecosystem.manifest.json`
- Dry-run default; file changes only with `--apply`
- Conservative deep-merging of existing project files
- Provider and model preservation (never forces a vendor)
- Timestamped backup with rollback manifest
- Run classification: `GREEN_SAFE`, `AMBER_REVIEW`, `RED_BLOCK`, `TOOL_GAP`

### Layer 2: Canonical Working Method (new)

#### 2.1 Central Documents

| Document | Format | Purpose |
|----------|--------|---------|
| `WORKING-METHOD.md` | Markdown | Human-readable canonical workflow contract. All standards, rules, gates, tiers, and truth layers in one document. |
| `working-method.json` | JSON Schema | Machine-readable policy. Workflow steps, risk tiers, truth layers, pre-flight checks, gate chains, and anti-fake-execution rules. |

#### 2.2 Six New Skills

| # | Skill | Purpose |
|---|-------|---------|
| 1 | `context-engineering` | Manages Cold/Warm/Hot Context Levels, Context Manifest, and Hard-Constraint-Re-Injection after Compaction. |
| 2 | `risk-tier-routing` | Classifies changes into Risk Tiers (LOW/MEDIUM/HIGH/CRITICAL) and determines Speckit scope. |
| 3 | `verification-contract` | Defines and validates standardized, auditable acceptance criteria for completion claims. |
| 4 | `owner-approval-gate` | Implements 9 separate human approval gates for Apply, Commit, Push, PR, Merge, Deploy, Remote CI, Skill Write, Memory Write. |
| 5 | `anti-fake-execution` | Validates tool output and test results through structured evidence requirements — every claim must carry verifiable tool output. |
| 6 | `privacy-data-minimization` | Generic PII detection, data minimization, and deletion rules applicable to any project (not domain-specific). |

#### 2.3 Six Updated Existing Skills

| Skill | Changes |
|-------|---------|
| `run-card` | Now includes risk tier classification output |
| `project-reality-refresh` | Now ties into truth layer hierarchy (Layer 0 → Layer 3 validation) |
| `spec-driven-development` | Now risk-tier-aware: full Speckit only at HIGH/CRITICAL; reduced at MEDIUM; minimal at LOW |
| `read-before-sketch` | Now enforces context level gating — HOT required before implementation |
| `security-evidence-gate` | Now runs *before* compliance step in reordered pipeline |
| `audit-trail-enforcer` | Now logs context level transitions and truth layer provenance |

### Layer 3: Hermes Handoff (enhanced)

- Native YAML skill bundle: `.hermes/bundles/project-bootstrap.yaml`
- Config example with write-approval gates (`skills.write_approval`, `memory.write_approval`)
- External skill directory guidance via `~/.hermes/config.yaml` → `skills.external_dirs`
- Separated Skill-Write-Gate and Memory-Write-Gate from the main approval gates
- Hermes MCP gateway mode remains opt-in and human-gated

## Context Level Transitions

Agents must not perform work at the wrong context level. The transition between levels is gated by specific skills.

```
COLD Context ───(Reality Refresh)───► WARM Context ───(Owner Approval)───► HOT Context
     │                                      │                                    │
     │ Available:                           │ Available:                         │ Available:
     │ • Repository structure               │ • All COLD data                    │ • All WARM data
     │ • AGENTS.md, SECURITY.md             │ • Current issue/ticket             │ • Full session history
     │ • ecosystem.manifest.json            │ • Relevant policies                │ • Open subagent results
     │ • Working method contract            │ • Last run reports                 │ • Live diagnostics
     │                                      │ • Context manifest                 │ • Active verification contracts
     │ Permitted:                           │                                    │
     │ • Read-only analysis                 │ Permitted:                         │ Permitted:
     │ • Research                           │ • Planning                         │ • Implementation
     │ • Architecture review                │ • Specification                    │ • File mutation
     │                                      │ • Security/Compliance analysis     │ • Test execution
     │                                      │ • Red test creation                │ • Evidence collection
```

**Hard-Constraint-Re-Injection:** After OpenCode `compaction.auto` triggers context compression, the `context-engineering` skill MUST re-inject the following constraints before any further work:

1. Write Protection rules (`write-protection.json`)
2. Human Approval Gates (`owner-approval-gate`)
3. Non-Touch Areas
4. MCP Trust Tiers
5. Risk Tier classification of the current task

## Truth Layers (0-4)

A strict hierarchy of evidentiary trust. Higher-numbered layers are less authoritative. Lower layers invalidate higher layers on conflict.

```
Layer 0: Reality                         ← HIGHEST TRUST
    └─ Actual repository state (git status, file contents on disk, filesystem)

Layer 1: Executable                      ↓
    └─ Running processes (test output, compiler output, linter output, runtime logs)

Layer 2: Evidence                        ↓
    └─ Documented proofs (screenshots, captured logs, CVSS vectors, PoC artifacts)

Layer 3: Documentation                   ↓
    └─ Authoritative project docs (policies, README, ADRs, working method, manifest)

Layer 4: Memory/Chat                     ← LOWEST TRUST
    └─ Agent output, chat history, model generations
```

**Enforcement rules:**
- Any claim must cite at minimum one layer below the claim's layer. A Layer 3 claim (documentation) requires Layer 0-2 evidence.
- A bug-fix claim requires: Layer 0 (code change visible in `git diff`) + Layer 1 (test output before/after) + Layer 2 (documented regression test).
- Memory/chat assertions (Layer 4) are never sufficient as sole evidence.

## Approval Gates (9 Separate Gates)

Replaces the previous amorphous ask/deny model with granular, named gates:

| # | Gate | Trigger | Default | Override |
|---|------|---------|---------|----------|
| 1 | **Apply Gate** | Any file modification in workspace | Ask | Risk tier: LOW=allow, MEDIUM=ask, HIGH/CRITICAL=deny (human required) |
| 2 | **Commit Gate** | `git commit` | Ask | LOW=allow, MEDIUM=ask, HIGH/CRITICAL=deny |
| 3 | **Push Gate** | `git push` to any remote | Deny | Requires explicit human approval at all tiers |
| 4 | **PR Gate** | `gh pr create` | Deny | Requires explicit human approval |
| 5 | **Merge Gate** | `gh pr merge` | Deny | Requires explicit human approval + CI green |
| 6 | **Deploy Gate** | Any deployment trigger (docker compose prod, npm publish) | Deny | Always requires human approval; no risk-tier override |
| 7 | **Remote CI Gate** | Writing GitHub Actions workflows | Deny | Only when `--include-remote-ci` is present AND human approves |
| 8 | **Skill Write Gate** | Modifying any `.opencode/skills/` or `.hermes/skills/` file | Deny | Requires explicit human approval |
| 9 | **Memory Write Gate** | Writing to `.opencode/memory/` or agent memory store | Deny | Requires explicit human approval |

**Gate chaining:** Each gate must pass independently. Clearing Gate 2 (Commit) does not automatically clear Gate 3 (Push).

## OpenCode / Hermes Separation

```
OpenCode                                Hermes
────────                                ──────
• Primary coding executor               • Orchestration and skill runtime
• Writes project-local config           • Writes portable project-local bundles
• Runs agents, tools, tests             • Manages skill execution
• Manages context/window                • MCP gateway (opt-in, human-gated)
• Applies file mutations                • Handoff notes and bundle manifests

Shared: Skills (same content, bootstrapped to both), policies, working method contract
Never: One silently overwrites the other's config
```

## MCP Trust Tiers vs. Workflow Risk Tiers

These are separate, orthogonal dimensions. MCP Trust Tiers classify *tool capability*. Workflow Risk Tiers classify *change impact*.

### MCP Trust Tiers (Tool Capability)

| Tier | Name | Scope | Examples | Default |
|------|------|-------|----------|---------|
| 0 | Readonly | Remote read-only, no filesystem, no shell | GitHub search, Brave Search, Context7 | Disabled |
| 1 | Sandboxed | Project-local write, container isolation, localhost network | Playwright, Docker, SQLite | Disabled |
| 2 | Trusted | Full write, external FS, requires human gate + audit | Filesystem (external), PostgreSQL | Disabled |

### Workflow Risk Tiers (Change Impact)

| Tier | Description | Examples | Speckit Scope | Human Gate |
|------|-------------|----------|---------------|------------|
| **CRITICAL** | Security patch, data loss, PII exposure, auth bypass | SQL injection fix, secret rotation, encryption upgrade | Full (constitution → implement) | Push Gate |
| **HIGH** | Breaking change, architecture shift, major refactor | API version bump, DB schema migration, framework upgrade | Full (constitution → implement) | Apply Gate |
| **MEDIUM** | Configuration change, new feature, dependency update | New endpoint, package upgrade, CI change | Reduced (spec + tasks + implement) | Commit Gate |
| **LOW** | Typo fix, formatting, documentation, non-functional change | README update, comment fix, lint autofix | Minimal (no Speckit required) | None |
| **UNVERIFIED** | Cannot classify the change | Unknown scope, ambiguous impact | Full (constitution → implement) | Push Gate |

**Routing rule:** The `risk-tier-routing` skill classifies each task before any work begins. Risk tier is recorded in the Run Card.

## Non-Touch Areas

Files that no agent may modify under any circumstances. This extends `write-protection.json` with a human-readable list.

| File / Pattern | Reason |
|----------------|--------|
| `opencode.jsonc` / `opencode.json` | OpenCode config — structural change risk |
| `.opencode/policies/*.json` | Policy files — change could disable security gates |
| `.opencode/agents/*.md` | Agent definitions — change could alter delegation rules |
| `.github/workflows/*.yml` | CI workflows — only via `--include-remote-ci` + human gate |
| `SECURITY.md` | Security policy — must not be weakened |
| `LICENSE` | Legal document — not agent-modifiable |
| `*.db`, `*.db-shm`, `*.db-wal` | Database files — never commit, never mutate without migration agent |
| `.env`, `.env.*` | Environment files — secrets risk |
| `package.json` (dependencies) | Requires explicit human approval for changes |
| `Dockerfile` | Requires explicit human approval for changes |

## 24-Step Workflow (Updated Order)

Security now runs before Compliance (positions 6 and 7 swapped from the previous 12-step order).

```
Preflight ──────────────────────────────────────────────────────────────────┐
  1. OS/Shell/Runtime/Tool Pre-Flight Check                                  │
                                                                             │
Context Transition: COLD → WARM ─────────────────────────────────────────── │
  2. Reality Refresh (project state validation)                              │
  3. Context Manifest (declare context level, loaded skills)                  │
  4. Run Card with Risk Tier (classify task)                                  │
                                                                             │
Structured Analysis ──────────────────────────────────────────────────────── │
  5. Research (external docs, dependencies, official sources)                 │
  6. Planning (spec creation, task breakdown)                                │
  7. Architecture (ADR if structural change)                                 │
  8. Security (threat model, CVSS, vulnerability surface)    ← was step 7    │
  9. Compliance (DSGVO, retention, PII audit)               ← was step 6    │
                                                                             │
Verification Contract ────────────────────────────────────────────────────── │
 10. Verification Contract (define acceptance criteria)                      │
 11. Red Tests (write failing test proving bug exists)                       │
 12. Owner Approval Gate (Apply Gate — human confirms plan)                  │
                                                                             │
Context Transition: WARM → HOT ──────────────────────────────────────────── │
 13. Implementation (code changes, mutations)                                │
 14. Local Validation (tests, lint, typecheck, build)                        │
 15. Reality Gate (git diff review against plan)                             │
 16. Truth Mirror (align all 5 truth layers)                                 │
                                                                             │
Review & Evidence ────────────────────────────────────────────────────────── │
 17. Reviewer (code review, regression scan)                                 │
 18. Evidence-Abschluss (collect all evidence, validate claims)              │
                                                                             │
Release Gates ────────────────────────────────────────────────────────────── │
 19. Commit Gate (local commit approval)                                     │
 20. Push Gate (remote push approval)                                        │
 21. PR Gate (pull request creation approval)                                │
 22. Merge Gate (PR merge approval)                                          │
 23. Deploy Gate (deployment approval)                                       │
 24. Truth Mirror Update (document final state in all 5 layers)              │
```

## Component Diagram

```
                          ┌─────────────────┐
                          │   PREFLIGHT     │
                          │ OS/Shell/Runtime│
                          │   Tool Check    │
                          └────────┬────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      ▼                      │
            │  ┌──────────────────────────────────────┐   │
            │  │      CONTEXT ENGINEERING             │   │
            │  │                                      │   │
            │  │  COLD ───────► WARM ───────► HOT    │   │
            │  │                                      │   │
            │  └──────────────────────────────────────┘   │
            │                      │                      │
            │     ┌────────────────┼────────────────┐     │
            │     ▼                ▼                 ▼     │
            │ ┌───────┐   ┌────────────┐   ┌────────────┐ │
            │ │Reality│   │Run Card +  │   │ Research   │ │
            │ │Refresh│   │Risk Tier   │   │ Planning   │ │
            │ └───┬───┘   │Routing     │   │Architecture│ │
            │     │        └─────┬──────┘   │Security    │ │
            │     │              │          │Compliance  │ │
            │     │              │          └──────┬─────┘ │
            │     │              │                 │       │
            │     │     ┌────────┼─────────────────┘       │
            │     │     │        ▼                         │
            │     │     │  ┌──────────────────┐            │
            │     │     │  │Verification      │            │
            │     │     │  │Contract          │            │
            │     │     │  │+ Red Tests       │            │
            │     │     │  │+ Owner Approval  │            │
            │     │     │  └────────┬─────────┘            │
            │     │     │           │                      │
            │     │     │           ▼                      │
            │     │     │  ┌──────────────────┐            │
            │     │     │  │Implementation    │            │
            │     │     │  │+ Local Validation│            │
            │     │     │  │+ Reality Gate    │            │
            │     │     │  │+ Truth Mirror    │            │
            │     │     │  └────────┬─────────┘            │
            │     │     │           │                      │
            │     │     │           ▼                      │
            │     │     │  ┌──────────────────┐            │
            │     │     │  │Reviewer          │            │
            │     │     │  │+ Evidence-       │            │
            │     │     │  │  Abschluss       │            │
            │     │     │  └────────┬─────────┘            │
            │     │     │           │                      │
            │     │     │           ▼                      │
            │     │     │  ┌──────────────────┐            │
            │     │     │  │9 Release Gates   │            │
            │     │     │  │Commit→Push→PR    │            │
            │     │     │  │→Merge→Deploy     │            │
            │     │     │  └──────────────────┘            │
            │     │     │                                  │
            │     │     │  ┌──────────────────┐            │
            │     │     │  │TRUTH LAYERS 0-4  │            │
            │     │     │  │(validated at     │            │
            │     │     │  │ each step)       │            │
            │     │     │  └──────────────────┘            │
            │     │     │                                  │
            └─────┴─────┴──────────────────────────────────┘
```

## Alternatives Considered

### Option A: Canonical Working Method as a Separate Repository

- **Pros:** Clean separation of concerns; independent versioning; could be consumed by multiple ecosystem repositories.
- **Cons:** Adds cross-repo coordination overhead; bootstrapping becomes multi-repo; truth-layer synchronization across repos is fragile; ADRs and manifests would need cross-repo linking.
- **Rejected:** The working method is tightly coupled to the skills and policies it governs. Separating them would create a distributed truth problem — exactly what this layer is designed to prevent.

### Option B: Integrate Everything into the Manifest (ecosystem.manifest.json)

- **Pros:** Single file; already machine-readable; minimal new files.
- **Cons:** The manifest is already 350+ lines. Adding risk tiers, truth layers, context engineering rules, approval gate chains, and verification contracts would make it unreadable and unmaintainable. The manifest is a *catalog*; the working method is a *contract*. Different concerns, different consumers.
- **Rejected:** Manifest and working method serve different audiences (selection vs. execution). Merging them would violate separation of concerns and make versioning either independently impossible.

### Option C: Status Quo — No Canonical Working Method Layer

- **Pros:** No new files; no migration cost; existing workflows continue uninterrupted.
- **Cons:** The deep-dive audit identified 13 missing standards, 8 contradictions, and 10 technical debts. Agents operate without context-level enforcement, risk-tier routing, verification contracts, or anti-fake-execution protections. Completion claims are not auditable. Security runs after Compliance. The Speckit workflow is forced uniformly. No machine-readable policy exists for automated workflow validation.
- **Rejected:** The status quo is fragile and accumulating gaps. Each missing standard is a potential failure mode. The cost of inaction exceeds the cost of implementation.

## Consequences

### Positive

- **Auditable completions:** Every `done`/`fixed`/`complete` claim now requires a Verification Contract with specific, validated criteria. Evidence gates are systematically enforced.
- **Context safety:** No implementation in COLD context. Hard-Constraint-Re-Injection prevents silent safety-constraint loss after compaction.
- **Risk-proportional workflow:** LOW-risk typo fixes are frictionless; CRITICAL security patches get full Speckit rigor. No more one-size-fits-all process.
- **Granular owner control:** 9 separate approval gates give project owners fine-grained control over what agents may do and when human review is required.
- **Hallucination defense:** Anti-Fake-Execution rules require verifiable tool output for every claim. "npm test passed" without actual output is rejected.
- **Truth hierarchy:** Lower layers invalidate higher layers on conflict. Agents cannot cite chat history (Layer 4) as sole evidence for claims.
- **Machine-auditable:** `working-method.json` enables automated validation of workflow compliance, gate adherence, and truth-layer consistency.
- **Corrected ordering:** Security analysis precedes Compliance analysis, fixing the inverted pipeline.

### Negative

- **Initial friction:** The full 24-step workflow with context transitions and 9 gates introduces more checkpoints than the previous 12-step process. Teams accustomed to rapid iteration may perceive overhead.
- **Skill proliferation:** 6 new skills + 6 updated skills increases the skill catalog. Agents must load more modules. On resource-constrained local models, this may impact performance.
- **Migration burden:** Existing `AGENTS.md`, `issue-orchestrator.md`, and `opencode.jsonc` must be updated to reflect the new order, gates, and context rules. Several files contain the old 12-step order and must be aligned.
- **Learning curve:** Contributors must understand the distinction between MCP Trust Tiers (tool capability) and Workflow Risk Tiers (change impact), Truth Layers vs. Context Levels, and the 9 separate approval gates.
- **Hermes gap:** The Hermes YAML bundle and write-approval gates remain partially speculative — Hermes runtime verification is blocked by `TOOL_GAP_HERMES_RUNTIME`.

### Neutral

- The Universal Bootstrap (Layer 1) is unchanged. Existing dry-run, apply, rollback, and validation workflows continue to function.
- All existing MCP Trust Tier classifications are preserved. The new Risk Tiers are an additive dimension.
- The repository still bootstraps OpenCode and Hermes as before. The working method layer adds rules and structure but does not alter bootstrap mechanics.
- Domain-specific policies (tierheim-compliance, funding-document-generator) remain conditional on project signals.

## References

- [Working Method Deep Dive Report](../reports/working-method-deep-dive-2026-07-15.md) — Full audit of missing standards, contradictions, and technical debts.
- [AGENTS.md](../../AGENTS.md) — Current 12-step workflow and agent rules.
- [ecosystem.manifest.json](../../ecosystem.manifest.json) — Machine-readable catalog of agents, skills, policies, and MCP servers.
- [Evidence Gates Policy](../../.opencode/policies/evidence-gates.json) — Mandatory evidence requirements for claims.
- [MCP Trust Tiers Policy](../../.opencode/policies/mcp-trust-tiers.json) — Tool capability classification (Tier 0-2).
- [Write Protection Policy](../../.opencode/policies/write-protection.json) — Human-gate-required and deny-always operations.
- [Universal Bootstrap Architecture](universal-bootstrap.md) — Layer 1 architecture documentation.
- [ADR Template](../../.opencode/templates/adr-template.md) — Standard ADR format.
