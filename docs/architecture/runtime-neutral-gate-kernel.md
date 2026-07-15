# ADR-003: Runtime-Neutral Hard Gate Kernel

**Status:** Proposed

**Date:** 2026-07-15

**Deciders:** Architecture Agent (delegated from issue-orchestrator)

## Context

### What Problem Does This Solve?

The OpenCode Agent Ecosystem currently has:

- A **Canonical Working Method** (`WORKING-METHOD.md`) that defines the 24-step evidence-gated workflow agents must follow.
- **Policy files** (`.opencode/policies/*.json`) that encode security rules, evidence gates, write protections, MCP trust tiers, and data retention requirements.
- **Runtime adapters**: The bootstrap detects OpenCode and Hermes, with Odysseus (AGPL-3.0) on the horizon.

However, there is a critical architectural gap: **the enforcement of invariant constraints depends entirely on the runtime**.

- OpenCode reads `opencode.jsonc` permissions and respects them — but could be misconfigured.
- Hermes has `/yolo` bypass, `skills.write_approval` flags, and external skill directories that are not write-protected.
- Odysseus (AGPL-3.0-or-later) has no native import API for agent rules — only handoff support — and mounts Docker sockets as an opt-in, with `0.0.0.0` binding without auth being CRITICAL.
- A malicious or misconfigured runtime adapter could weaken, disable, or bypass any policy.

The problem is not only cross-runtime consistency — it is **runtime neutrality**. No single runtime owns the gate logic. The kernel must enforce invariant gates **before** any runtime adapter sees the decision, and adapters may only **add** restrictions, never **remove** them.

### Forces at Play

| Force | Direction |
|-------|-----------|
| **Runtime diversity** | The ecosystem must support OpenCode, Hermes, Odysseus, and unknown future runtimes without rewriting gate logic per runtime. |
| **Immutability of safety invariants** | Certain gates (force-push, secret leak, path escape, AGPL incorporation) must never be configurable or overridable by any runtime adapter. |
| **Configurable tightening** | Project owners need the ability to add project-specific restrictions (offline-only, no cloud LLM, no remote CI, protected files) without touching kernel code. |
| **Evidence-driven decisions** | Every gate decision must be auditable, machine-readable, and reproducible — not just a boolean allow/deny. |
| **AGPL boundary** | Odysseus is AGPL-3.0-or-later. The ecosystem (MIT? unlicensed?) must not incorporate Odysseus source code. Detection and handoff must operate at arm's length. |
| **No runtime-adapter-override** | An adapter that claims to be "OpenCode" but weakens gates must be detectable and blockable. |
| **Approval safety** | Approvals must be scope-bound, single-use, non-transferable, and expiring. Cross-action and cross-scope approval must be structurally impossible. |

### What The Canonical Working Method Already Defines

ADR-001 (Universal Bootstrap) and the Canonical Working Method layer already provide:

- 24-step evidence-gated execution order
- Truth layers (0–4) with `REALITY_WINS` precedence
- Risk tiers (LOW_LOCAL, MEDIUM_REVIEW, HIGH_HUMAN_GATE, CRITICAL_BLOCK)
- 9 owner approval gates (Apply, Commit, Push, PR, Merge, Deploy, Remote CI, Skill Write, Memory Write)
- Evidence gates for claims (severity, architecture, migration, bug-fix, feature, compliance)
- Anti-fake-execution rules
- Non-touch areas
- MCP trust tiers (0–2)
- Context levels (COLD, WARM, HOT)

**What is missing:** A runtime-neutral enforcement kernel that guarantees these invariants are checked identically regardless of whether the executing runtime is OpenCode, Hermes, Odysseus, or an unknown future runtime.

---

## Decision

Implement a **Runtime-Neutral Hard Gate Kernel** with three distinct gate layers and four runtime adapters, all governed by an immutable kernel gate contract that no adapter may weaken.

### Three-Layer Gate Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 1: KERNEL GATES (Hard-coded, never configurable)            │
│                                                                    │
│ 19 invariant gates implemented in scripts/lib/gates/kernel.mjs    │
│ No runtime adapter, policy file, or project config can disable    │
│ or weaken these gates. They are the floor — the minimum safety    │
│ baseline that every runtime must satisfy.                         │
│                                                                    │
│ Gate decision: ALL kernel gates must return "allowed" for the     │
│ operation to proceed. Any single kernel gate violation produces   │
│ RED_BLOCK.                                                         │
└───────────────────────────────┬──────────────────────────────────┘
                                │ Only after all kernel gates pass
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 2: RISK-TIER POLICY GATES (Configurable, only tightening)   │
│                                                                    │
│ Policy-driven gates read from .opencode/policies/*.json            │
│ These are configurable but may ONLY add restrictions — never      │
│ remove kernel gate protections.                                    │
│                                                                    │
│ • Agent selection constraints                                      │
│ • Full Speckit requirement (per risk tier)                        │
│ • Security screening rules                                        │
│ • Compliance screening rules                                      │
│ • Test matrix requirements                                        │
│ • Evidence requirements (per claim type)                          │
│ • Comment behavior (GitHub issue comments)                        │
│ • Runtime smoke test requirements                                 │
│ • Human gate level (per operation type)                           │
│ • Data retention enforcement                                      │
└───────────────────────────────┬──────────────────────────────────┘
                                │ Policy gates produce additional
                                │ blockers/warnings but cannot
                                │ override kernel gate decisions
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 3: PROJECT GATES (Project-local, additive only)             │
│                                                                    │
│ Per-project constraints that further tighten execution boundaries: │
│                                                                    │
│ • local-only (no external network)                                │
│ • offline (no network at all)                                     │
│ • no cloud LLM (local models only)                                │
│ • no remote CI (block GitHub Actions)                             │
│ • no new dependencies (freeze package.json)                       │
│ • no database migrations                                          │
│ • no network access                                               │
│ • no production data                                              │
│ • protected files (per-project extension of non-touch areas)      │
│ • domain-specific retention (tierheim/civipet overrides)          │
│ • required human review (per-file or per-module)                  │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│ RUNTIME ADAPTER CONTRACT                                          │
│                                                                    │
│ Each adapter implements the same 8-method contract. Adapters      │
│ receive the kernel+policy gate decision and may only:             │
│   (a) add runtime-specific blockers                               │
│   (b) add runtime-specific evidence requirements                  │
│   (c) add runtime-specific tool gaps                              │
│   (d) add runtime-specific warnings                               │
│                                                                    │
│ Adapters MUST NOT:                                                │
│   (x) change kernel gate decisions from blocked to allowed        │
│   (x) remove blockers added by other layers                       │
│   (x) claim capabilities they cannot execute                      │
│                                                                    │
│ Four adapters:                                                    │
│   • Generic    — fallback for unknown runtimes                    │
│   • OpenCode   — detects opencode.json / .opencode/               │
│   • Hermes     — detects .hermes.md / .hermes/                    │
│   • Odysseus   — multi-signal detection, AGPL boundary           │
└──────────────────────────────────────────────────────────────────┘
```

### The Gate Decision Contract

Every gate evaluation produces a machine-readable JSON decision object. This is the single source of truth for all downstream consumers (runtime adapters, handoff generators, audit logs).

```json
{
  "classification": "GREEN_SAFE | AMBER_REVIEW | RED_BLOCK | TOOL_GAP",
  "runtime_identifier": "opencode-1.15.13 | hermes-0.18.2 | odysseus-0.x | generic",
  "verification_level": "NOT_CHECKED | STRUCTURAL_PASS | CLI_PASS | RUNTIME_SMOKE_PASS | LIVE_INTEGRATION_PASS | TOOL_GAP | FAILED",

  "allowed": true,
  "blocked_by": [
    {
      "layer": "kernel",
      "gate": "NO_FORCE_PUSH",
      "reason": "Command matches git push --force pattern",
      "evidence": "Command string: 'git push --force origin main'"
    }
  ],
  "required_approvals": [
    {
      "id": "push",
      "status": "NOT_REQUESTED",
      "scope": {
        "action": "push",
        "runtime": "opencode",
        "repository": "git@github.com:org/repo.git",
        "branch": "main",
        "paths": ["src/**"]
      }
    }
  ],
  "consumed_approvals": [],
  "required_evidence": [
    "git_diff_stat",
    "test_output",
    "security_review_report"
  ],
  "present_evidence": [
    "git_diff_stat"
  ],
  "runtime_capabilities": {
    "can_apply": true,
    "can_commit": true,
    "can_push": false,
    "can_run_tests": true,
    "can_create_pr": false,
    "can_merge": false,
    "can_deploy": false,
    "can_read_external_docs": true,
    "can_sandbox_execution": true,
    "can_validate_paths": true
  },
  "warnings": [
    "Runtime 'hermes' does not support path-safety validation natively — kernel fallback used."
  ],
  "tool_gaps": [
    {
      "tool": "docker",
      "required_by": "hermes sandbox skill execution",
      "available": false,
      "fallback": "Direct host execution (denied by kernel gate NO_PRODUCTION_WRITE_WITHOUT_APPROVAL)"
    }
  ],
  "decision_timestamp": "2026-07-15T14:30:00.000Z"
}
```

---

## Module Structure

```
scripts/lib/gates/                  # Kernel gate engine (runtime-agnostic)
├── kernel.mjs                      # 19 hard-coded invariant gates
├── kernel.test.mjs                 # Tests for all kernel gates
├── policy.mjs                      # Risk-tier policy gate evaluator
├── policy.test.mjs                 # Tests for policy gate evaluation
├── project.mjs                     # Project-local gate loader
├── project.test.mjs                # Tests for project gate loading
├── approval.mjs                    # Approval receipt model (scope, fingerprint, expiry)
├── approval.test.mjs               # Tests for approval lifecycle
├── decision.mjs                    # Gate decision contract builder
└── decision.test.mjs               # Tests for decision contract

scripts/lib/runtimes/               # Runtime adapters
├── contract.mjs                    # Adapter contract interface (abstract)
├── adapter-generic.mjs             # Generic fallback adapter
├── adapter-generic.test.mjs
├── adapter-opencode.mjs            # OpenCode-specific adapter
├── adapter-opencode.test.mjs
├── adapter-hermes.mjs              # Hermes-specific adapter
├── adapter-hermes.test.mjs
├── adapter-odysseus.mjs            # Odysseus-specific adapter (AGPL boundary)
├── adapter-odysseus.test.mjs
├── detection.mjs                   # Multi-signal runtime detection
└── detection.test.mjs

.opencode/policies/
├── gate-kernel-invariants.json     # Machine-readable kernel gate definitions (read-only reference)
├── gate-policy-tiers.json          # Risk-tier policy gate configuration (extend existing policies)
└── gate-project-template.jsonc     # Template for project-local gate overrides
```

**Critical design constraint:** `scripts/lib/gates/kernel.mjs` must have **zero imports** from runtime adapters, policies, or configuration files that could be modified at runtime. It defines its 19 gates as pure functions that take an operation descriptor and return `{ passed: boolean, reason: string, evidence: object }`. The only external dependency permitted is `node:crypto` for fingerprint hashing.

---

## Data Flow

### Gate Evaluation Sequence

```
                ┌──────────────────────┐
                │   Operation Request   │
                │  (action, scope,      │
                │   paths, runtime)     │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  1. RUNTIME DETECT   │
                │  (detection.mjs)     │
                │                      │
                │  Scan for signals:   │
                │  • opencode.jsonc    │
                │  • .hermes.md        │
                │  • odysseus signals  │
                │  → runtime_id, conf  │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  2. KERNEL GATES     │
                │  (kernel.mjs)        │
                │                      │
                │  ALL 19 gates must   │
                │  return "passed"     │
                │                      │
                │  If ANY fail →       │
                │  RED_BLOCK, stop     │
                └──────────┬───────────┘
                           │ All kernel gates pass
                           ▼
                ┌──────────────────────┐
                │  3. POLICY GATES     │
                │  (policy.mjs)        │
                │                      │
                │  Load risk-tier      │
                │  policies, evaluate  │
                │  evidence gates,     │
                │  security/comp.      │
                │                      │
                │  Can add blockers    │
                │  Cannot remove them  │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  4. PROJECT GATES    │
                │  (project.mjs)       │
                │                      │
                │  Load project-local  │
                │  constraints, apply  │
                │  additional restrict.│
                │                      │
                │  Can only TIGHTEN    │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  5. CLASSIFICATION   │
                │  (decision.mjs)      │
                │                      │
                │  Merge all layers:   │
                │  • classification    │
                │  • blocked_by        │
                │  • required_evidence │
                │  • required_approvals│
                │  • warnings          │
                │  • tool_gaps         │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  6. RUNTIME ADAPTER  │
                │  (adapter-*.mjs)     │
                │                      │
                │  Runtime-specific:   │
                │  • validate()        │
                │  • plan()            │
                │  • evaluateRuntimeG. │
                │  • generateHandoff() │
                │  • runtimeSmoke()    │
                │  • normalizeEvidence │
                │                      │
                │  May add blockers,   │
                │  NEVER removes them  │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  7. FINAL DECISION   │
                │                      │
                │  • allowed: bool     │
                │  • classification    │
                │  • gate decision JSON│
                │  • handoff (if appl.)│
                └──────────────────────┘
```

### Adapter May-Never-Weaken Contract

Each runtime adapter's `evaluateRuntimeGates(decision)` method receives the merged decision from all three gate layers. It returns a potentially augmented decision:

```javascript
// Adapter contract (pseudocode)
function evaluateRuntimeGates(kernelDecision) {
  // ✅ ALLOWED: Add blockers
  if (runtimeDetectedYoloBypass()) {
    decision.blocked_by.push({ layer: "runtime", gate: "NO_YOLO_BYPASS", ... })
  }

  // ✅ ALLOWED: Add tool gaps
  if (!dockerAvailable()) {
    decision.tool_gaps.push({ tool: "docker", ... })
  }

  // ✅ ALLOWED: Add evidence requirements
  decision.required_evidence.push("hermes_skill_execution_log")

  // ❌ FORBIDDEN: Never change kernel gate decisions
  // decision.blocked_by = decision.blocked_by.filter(g => g.gate !== "NO_FORCE_PUSH")  // ILLEGAL

  // ❌ FORBIDDEN: Never override classification upward
  // if (decision.classification === "RED_BLOCK") decision.classification = "AMBER_REVIEW"  // ILLEGAL

  // ❌ FORBIDDEN: Never claim capabilities the runtime does not actually have
  // if (!canActuallyRunTests) decision.runtime_capabilities.can_run_tests = true  // ILLEGAL

  return decision;
}
```

This contract is enforced structurally: `kernel.mjs` runs first and produces an immutable base decision. Adapters receive a frozen copy. Their output is diffed against the kernel decision — any weakening is automatically classified as `RED_BLOCK` with the gate `NO_RUNTIME_ADAPTER_OVERRIDE`.

---

## Kernel Gate Invariants (19 Gates)

Each gate is defined by:
- **Invariant**: The safety property it guarantees.
- **Trigger**: When the gate activates.
- **Enforcement**: How the gate is checked (automatic, structural, or runtime-validated).
- **Violation Result**: Always `RED_BLOCK` — no fallback, no override.

---

### 1. NO_FORCE_PUSH

| Property | Value |
|----------|-------|
| **Invariant** | No operation may force-push to any remote. |
| **Trigger** | Command string matches `git push --force*`, `git push -f*`, or equivalent flags. |
| **Enforcement** | Pattern match on command string before execution. Combined with `NO_REMOTE_ACTION_WITHOUT_SCOPED_APPROVAL`. |
| **Violation** | `RED_BLOCK` — operation denied with audit log. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 2. NO_SECRET_LEAK

| Property | Value |
|----------|-------|
| **Invariant** | No secret, token, API key, password, or PII may be written to stdout, log files, reports, commits, or configuration files. |
| **Trigger** | File write to `*.env*`, `*secret*`, `*credential*`, `*token*`; content containing patterns like `sk-*`, `ghp_*`, `xoxb-*`, `AIza*`, JWT tokens, private keys. |
| **Enforcement** | File path pattern matching + content regex scanning before write. |
| **Violation** | `RED_BLOCK` — operation denied, path logged (but NOT content). |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 3. NO_PATH_ESCAPE

| Property | Value |
|----------|-------|
| **Invariant** | No file operation may target a path outside the approved worktree or project root. |
| **Trigger** | Any file read/write/delete operation with a resolved absolute path outside the project boundary. Path traversal patterns (`../`, symlink chains, `XDG_CONFIG_HOME` manipulation). |
| **Enforcement** | `assertSafePath()` validation on every file path before any I/O operation. Walks every path segment with `fs.lstat()` to detect symlink attacks. |
| **Violation** | `RED_BLOCK` — operation denied, path logged. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 4. NO_SYMLINK_ESCAPE

| Property | Value |
|----------|-------|
| **Invariant** | No operation may follow a symlink that points outside the project boundary or to a sensitive system path. |
| **Trigger** | Any file operation encountering a symlink whose resolved target is outside the approved worktree. |
| **Enforcement** | `fs.lstat()` on each path segment before any read/write. Symlink target resolution compared against approved boundary list. |
| **Violation** | `RED_BLOCK` — operation denied, symlink target logged. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 5. NO_UNRELATED_WORKTREE_WRITE

| Property | Value |
|----------|-------|
| **Invariant** | No operation may write to files outside the explicitly scoped change set. Non-touch areas and files outside the current task's scope are protected. |
| **Trigger** | Any file write where the target path is not in the approved scope list (from Run Card or Verification Contract). |
| **Enforcement** | Scope validation against the `non_touch_areas` list + run-card scope before every write. Default: all files are non-touch unless explicitly in scope. |
| **Violation** | `RED_BLOCK` — operation denied, unauthorized path logged. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 6. NO_PRODUCTION_WRITE_WITHOUT_APPROVAL

| Property | Value |
|----------|-------|
| **Invariant** | No operation targeting production data, production databases, or production deployments may proceed without explicit, scoped human approval. |
| **Trigger** | Path or command matching `*production*`, `*prod_db*`, `*prod-*`; database operations on production-tagged connections; deployment commands. |
| **Enforcement** | String matching on target paths, database connection strings, and command strings. Approval receipt must exist with matching scope and non-expired status. |
| **Violation** | `RED_BLOCK` — operation denied, requires human approval gate. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 7. NO_REMOTE_ACTION_WITHOUT_SCOPED_APPROVAL

| Property | Value |
|----------|-------|
| **Invariant** | No operation that affects a remote system (git push, PR creation, merge, deployment, remote CI, npm publish) may proceed without a scoped, non-expired approval receipt. |
| **Trigger** | Any command classified as remote-mutating: `git push`, `gh pr create`, `gh pr merge`, `npm publish`, `docker push`, `git tag`, remote CI trigger. |
| **Enforcement** | Command classification + approval receipt validation. Each remote action type requires a distinct approval (push-approval ≠ merge-approval ≠ deploy-approval). |
| **Violation** | `RED_BLOCK` — operation denied, required approval type logged. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 8. NO_FALSE_GREEN

| Property | Value |
|----------|-------|
| **Invariant** | No operation may claim `GREEN_SAFE` or `PASS` status without verifiable evidence. Classification downgrade is automatic if evidence is missing. |
| **Trigger** | Any completion claim with `GREEN_SAFE` classification where required evidence (from evidence-gates.json) is absent. |
| **Enforcement** | Evidence completeness check before classification finalization. Each claim type has mandatory evidence fields — all must be present. Auto-downgrade: `GREEN_SAFE` → `AMBER_REVIEW` if evidence incomplete. |
| **Violation** | Downgrade to `AMBER_REVIEW` with flag; repeat violations escalate to `RED_BLOCK`. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 9. NO_FAKE_EXECUTION

| Property | Value |
|----------|-------|
| **Invariant** | No tool invocation, test run, file operation, or runtime check may be claimed without actual execution evidence (exit code, stdout, stderr, timestamp). |
| **Trigger** | Any claim of tool execution where the corresponding output artifact is missing, has zero-length stdout/stderr, or has a timestamp that predates the claimed execution. |
| **Enforcement** | Tool execution wrapper that captures exit code + stdout + stderr + wall-clock time. Claims without these four fields are rejected. |
| **Violation** | `RED_BLOCK` — the claim is invalidated. The operation that would have consumed the fake evidence is blocked. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 10. NO_REVIEWER_WRITE

| Property | Value |
|----------|-------|
| **Invariant** | The `review-agent` (a leaf node per delegation rules) must never write files, mutate code, or change configuration. It may only produce review reports. |
| **Trigger** | Any file write operation attributed to the `review-agent` role. |
| **Enforcement** | Role-based capability check. `review-agent` has write capability permanently disabled at the kernel level. |
| **Violation** | `RED_BLOCK` — operation denied. Audit log records the violation. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 11. NO_APPLY_WITHOUT_BACKUP

| Property | Value |
|----------|-------|
| **Invariant** | Before any file is modified in a target project during an `--apply` operation, a timestamped backup must be created. Apply operations without preceding backup are blocked. |
| **Trigger** | Any file write in a target project path during an apply-mode operation. |
| **Enforcement** | Backup manifest tracking. Before first write: create backup. After backup exists: writes allowed. If backup creation fails: block all writes. |
| **Violation** | `RED_BLOCK` — apply operation denied, no backup exists. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 12. NO_ROLLBACK_WITHOUT_VALIDATED_MANIFEST

| Property | Value |
|----------|-------|
| **Invariant** | Rollback operations must reference a validated backup manifest whose integrity (hash) matches the recorded manifest. Corrupted or tampered manifests are rejected. |
| **Trigger** | Any rollback operation (`--rollback <dir>`). |
| **Enforcement** | SHA-256 hash of backup manifest compared against the recorded hash from the apply run. Mismatch → rollback blocked. |
| **Violation** | `RED_BLOCK` — rollback denied, manifest integrity check failed. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 13. NO_APPROVAL_REUSE

| Property | Value |
|----------|-------|
| **Invariant** | Every approval receipt is single-use. Once an approval has been consumed (the approved action was executed), it cannot be reused for a subsequent execution of the same action. |
| **Trigger** | Any attempt to consume an approval receipt whose `nonce` has already been used or whose status is `CONSUMED`. |
| **Enforcement** | Each approval receipt contains a cryptographically random nonce (32 bytes). When an action is executed, the nonce is recorded in the consumed-nonce ledger. Replay is detected by nonce collision. |
| **Violation** | `RED_BLOCK` — operation denied, approval replay detected. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 14. NO_CROSS_ACTION_APPROVAL

| Property | Value |
|----------|-------|
| **Invariant** | An approval for one action type (e.g., `commit`) does not authorize a different action type (e.g., `push`). Each gate is independent. |
| **Trigger** | Any operation where the action type in the approval receipt does not match the requested action type. |
| **Enforcement** | Action-type field comparison. `approval.action !== requested_action` → blocked. |
| **Violation** | `RED_BLOCK` — operation denied, wrong approval type. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 15. NO_CROSS_SCOPE_APPROVAL

| Property | Value |
|----------|-------|
| **Invariant** | An approval scoped to specific files/paths does not authorize writes outside that scope. If the scope changes (new files added to change set), a new approval is required. |
| **Trigger** | Any file write where the target path is not covered by the scope in the active approval receipt. |
| **Enforcement** | Path-in-scope check. File paths are matched against the approval's scope paths using glob matching. Any out-of-scope path triggers re-approval. |
| **Violation** | `RED_BLOCK` — operation denied, scope violation. Existing approval is marked `EXPIRED` (scope changed). |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 16. NO_EXPIRED_APPROVAL

| Property | Value |
|----------|-------|
| **Invariant** | Approvals have a finite lifetime. After expiry, the approval transitions to `EXPIRED` and cannot be used. A new approval must be requested. |
| **Trigger** | Any operation attempting to use an approval receipt whose `expires_at` timestamp is in the past. |
| **Enforcement** | Timestamp comparison: `Date.now() > approval.expires_at` → expired. |
| **Violation** | `RED_BLOCK` — operation denied, approval expired. Receipt status updated to `EXPIRED`. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 17. NO_RUNTIME_ADAPTER_OVERRIDE

| Property | Value |
|----------|-------|
| **Invariant** | No runtime adapter may weaken, disable, or override any kernel gate decision. The kernel decision is the floor. Adapters may only add restrictions. |
| **Trigger** | Any adapter output that: (a) changes `blocked_by` entries from kernel layer to non-blocking, (b) modifies kernel gate decisions, (c) downgrades classification from `RED_BLOCK`, (d) claims capabilities known to be unsupported. |
| **Enforcement** | Structural enforcement: kernel produces an immutable base decision; adapter output is diffed against it; any weakening is automatically classified as `RED_BLOCK` with this gate. |
| **Violation** | `RED_BLOCK` — adapter output rejected. The runtime adapter that attempted the override is flagged. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config — this is the meta-gate that protects all other kernel gates. |

### 18. NO_GLOBAL_RUNTIME_CONFIG_WRITE

| Property | Value |
|----------|-------|
| **Invariant** | The ecosystem bootstrap may write project-local configuration only. It must never write to or modify the user's global runtime configuration (`~/.opencode/`, `~/.hermes/`, `~/.config/opencode/`) without explicit, scoped, human-approved global installer operation. |
| **Trigger** | Any file write operation targeting a path in the user's global config directory (`~/.opencode/`, `~/.hermes/`, `~/.config/opencode/`, `XDG_CONFIG_HOME/opencode/`) during a project-local bootstrap operation. |
| **Enforcement** | Path prefix check. Global config directories are detected at runtime. Project-local bootstrap operations targeting these paths are blocked. Only the explicit global installer (`scripts/install-global.mjs`) with its own path-safety protections may write to these directories. |
| **Violation** | `RED_BLOCK` — operation denied. Global config paths are protected. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config. |

### 19. NO_AGPL_INCORPORATION

| Property | Value |
|----------|-------|
| **Invariant** | Source code licensed under AGPL-3.0-or-later (specifically Odysseus) must never be copied, imported, vendored, bundled, or incorporated into the ecosystem's source tree. Detection and handoff must operate at arm's length through structured data exchange only. |
| **Trigger** | Any file read or dependency resolution of AGPL-3.0-or-later licensed code within the ecosystem's source tree. |
| **Enforcement** | License detection in dependency manifests + path check. The Odysseus adapter reads signals from the Odysseus project directory but never copies code. Handoff is structured as JSON manifest exchange. |
| **Violation** | `RED_BLOCK` — incorporation denied. The operation is blocked and the AGPL source path is flagged. |
| **Cannot be weakened by** | Any runtime adapter, any policy file, any project config — this is a legal boundary, not merely a technical preference. |

---

## Approval Receipt Model

### Schema

```json
{
  "receipt_id": "uuid-v4",
  "nonce": "crypto-random-32-bytes-base64url",
  "action": "push | commit | apply | merge | deploy | pr | remote_ci | skill_write | memory_write",
  "runtime": "opencode | hermes | odysseus | generic",
  "repository": "git@github.com:org/repo.git",
  "branch": "feature/some-change",
  "scope_paths": ["src/api/**", "src/models/**"],
  "context_fingerprint": "sha256(current-state)",
  "requested_at": "2026-07-15T14:00:00.000Z",
  "expires_at": "2026-07-15T18:00:00.000Z",
  "status": "NOT_REQUESTED | PENDING | APPROVED | DENIED | EXPIRED | CONSUMED",
  "approved_by": "human-identifier (optional)",
  "approved_at": null,
  "consumed_at": null
}
```

### Lifecycle State Machine

```
NOT_REQUESTED ──► PENDING ──► APPROVED ──► CONSUMED
                     │             │
                     ▼             ▼
                   DENIED       EXPIRED
                                  │
                                  ▼
                            NOT_REQUESTED (renewal)
```

### Key Properties

| Property | Description |
|----------|-------------|
| **Scope-bound** | Each receipt is bound to: action type + runtime + repository + branch + file path globs. Changing any one dimension invalidates the receipt. |
| **Context Fingerprint** | SHA-256 hash of the relevant repository state at approval time (git tree hash, affected file list, risk tier, verification contract hash). If the state changes (new commits on branch, scope change), the fingerprint is stale → receipt expires. |
| **Expiry** | Configurable TTL. Default: 4 hours for HOT context operations, 24 hours for WARM context planning approval. After expiry, status → `EXPIRED`. |
| **Single-use (Nonce)** | Each receipt carries a cryptographically random nonce. When the approved action executes, the nonce is consumed into a ledger. Any subsequent request with the same nonce is rejected (replay protection). |
| **Cross-action protection** | Action type is structurally enforced: `push` receipt ≠ `merge` receipt ≠ `apply` receipt. Cannot be interchanged. |
| **Cross-scope protection** | Scope paths are compared with glob matching. Write to a path not covered by the receipt's scope → receipt expires, operation blocked. |

---

## Adapter Contract

Every runtime adapter must implement the following 8-method interface:

```javascript
// scripts/lib/runtimes/contract.mjs (abstract)
export class RuntimeAdapter {
  /**
   * Detect whether this runtime is active in the target environment.
   * @param {string} targetRoot - Project root path
   * @returns {{ detected: boolean, confidence: number (0-100), signals: string[] }}
   */
  async detect(targetRoot) { throw new Error("Not implemented") }

  /**
   * Return the capabilities this runtime provides.
   * @returns {RuntimeCapabilities}
   */
  capabilities() { throw new Error("Not implemented") }

  /**
   * Produce an execution plan for the given operation within this runtime.
   * @param {GateDecision} decision - Merged kernel+policy+project gate decision
   * @returns {RuntimePlan}
   */
  async plan(decision) { throw new Error("Not implemented") }

  /**
   * Validate that the runtime environment is properly configured.
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  async validate() { throw new Error("Not implemented") }

  /**
   * Evaluate runtime-specific gates. Receives the kernel decision and may only ADD restrictions.
   * @param {GateDecision} kernelDecision - Immutable kernel gate decision (frozen)
   * @returns {GateDecision} - Augmented decision (must not weaken kernel decision)
   */
  async evaluateRuntimeGates(kernelDecision) { throw new Error("Not implemented") }

  /**
   * Generate a handoff manifest for cross-runtime transfer.
   * @param {GateDecision} decision
   * @returns {HandoffManifest}
   */
  async generateHandoff(decision) { throw new Error("Not implemented") }

  /**
   * Execute a runtime smoke test to verify the runtime is functional.
   * @returns {{ passed: boolean, output: string, errors: string[] }}
   */
  async runtimeSmoke() { throw new Error("Not implemented") }

  /**
   * Normalize runtime-specific evidence into the standard evidence format.
   * @param {object} rawEvidence - Runtime-native evidence
   * @returns {NormalizedEvidence}
   */
  normalizeEvidence(rawEvidence) { throw new Error("Not implemented") }
}
```

### Adapter Capabilities Interface

```javascript
// Each adapter declares which capabilities it actually supports
const RuntimeCapabilities = {
  can_apply: Boolean,              // Can modify files in target project
  can_commit: Boolean,             // Can create git commits
  can_push: Boolean,               // Can push to remote
  can_run_tests: Boolean,          // Can execute test suites
  can_create_pr: Boolean,          // Can create pull requests
  can_merge: Boolean,              // Can merge PRs
  can_deploy: Boolean,             // Can trigger deployments
  can_read_external_docs: Boolean, // Can fetch external documentation
  can_sandbox_execution: Boolean,  // Can execute code in isolated environment
  can_validate_paths: Boolean,     // Can perform path-safety validation
  can_detect_secrets: Boolean,     // Can scan for secrets in content
  can_check_licenses: Boolean,     // Can detect software licenses
};
```

**Critical Rule:** Adapters must never claim capabilities they cannot actually execute. The kernel gate `NO_FAKE_EXECUTION` validates capability claims against actual runtime behavior.

---

## Odysseus-Specific Design

### Why Odysseus Is Different

Odysseus (https://github.com/NousResearch/hermes-agent) shares the NousResearch lineage with Hermes but is a separate agent runtime licensed under **AGPL-3.0-or-later**. This creates a hard legal boundary that affects architecture, not just configuration.

### Multi-Signal Detection with Confidence Scoring

The Odysseus adapter uses multi-signal detection because there is no single canonical config file:

| Signal | Path/Pattern | Weight | Notes |
|--------|-------------|--------|-------|
| Claude integration | `integrations/claude/` | 25 | Presence of this directory |
| Codex integration | `integrations/codex/` | 25 | Presence of this directory |
| Companion module | `companion/` | 20 | Core agent runtime directory |
| Main entry point | `app.py` | 15 | Python application entry point |
| Skills data | `data/skills.json` | 10 | Skills in JSON format (not SKILL.md) |
| Presets data | `data/presets.json` | 5 | Agent configuration presets |

**Confidence scoring:**

| Score Range | Classification | Action |
|-------------|---------------|--------|
| 0–49 | `NOT_DETECTED` | Use Generic adapter |
| 50–79 | `AMBER_REVIEW` | Odysseus may be present — manual confirmation recommended. Proceed with Generic adapter and flag. |
| 80–100 | `DETECTED` | Odysseus confirmed. Apply Odysseus-specific gates and handoff. |

### AGPL Boundary Enforcement

The kernel gate `NO_AGPL_INCORPORATION` enforces these rules for Odysseus:

1. **No source code import:** The ecosystem must never `import`, `require()`, `fs.readFile()`, or otherwise load Odysseus source files into its own process space.
2. **No vendoring:** Odysseus code must never be copied into the ecosystem's source tree, even as a git submodule.
3. **Detection at arm's length:** The Odysseus adapter detects Odysseus by checking for the **presence** of signal files/directories — it does not read their contents beyond what is necessary for detection (first 512 bytes of `app.py` for license header detection, for example).
4. **Handoff only:** When Odysseus is detected, the ecosystem produces a structured JSON handoff manifest that Odysseus can consume independently. No code-level integration.
5. **Skills format bridge:** Odysseus uses `data/skills.json` (JSON array format), not `SKILL.md` (Markdown with YAML frontmatter). The handoff manifest includes a skills mapping for translation.
6. **Docker socket:** Odysseus mounts Docker sockets as an explicit opt-in. The ecosystem must detect if Docker socket is mounted and warn if it is exposed on `0.0.0.0` without authentication (CRITICAL classification).

### Handoff Strategy

```
Ecosystem (this repo)                    Odysseus (AGPL-3.0)
─────────────────────                    ───────────────────

  detect_odysseus()
       │
       ▼
  gate_decision (JSON)
       │
       ▼
  generate_handoff()
       │
       ▼
  handoff_manifest.json ──── arm's length ────► Odysseus reads
  (placed in project root                       manifest.json via
   or communicated via                            its own file I/O
   structured channel)
                                                 │
                                                 ▼
                                          Odysseus applies
                                          skills, policies,
                                          gates independently
```

**The handoff manifest never contains ecosystem source code.** It contains structured data: skill names, policy references, gate decisions, evidence requirements — formatted as a JSON document that Odysseus can parse with its own JSON parser.

### Security-Specific Concerns

| Concern | Severity | Mitigation |
|---------|----------|------------|
| Docker socket mounted without auth | CRITICAL | Kernel gate detects `0.0.0.0` bind without auth and produces `RED_BLOCK` |
| Loopback binding assumed but not verified | HIGH | Runtime smoke test verifies actual binding address |
| Skills.json format mismatch (JSON vs SKILL.md) | MEDIUM | Handoff manifest maps skills; Odysseus adapter translates format |
| No native import API for agent rules | LOW | Handoff approach is the only supported integration path |

---

## Alternatives Considered

### Option A: Policy-Files-Only Approach (No Hard-Coded Kernel)

- **Description:** Define all gate rules in JSON policy files (`.opencode/policies/*.json`). Each runtime adapter reads and enforces the policies itself. No hard-coded kernel.
- **Pros:**
  - Fully configurable — project owners have complete control.
  - No code changes needed to add or modify gates.
  - Simpler architecture — fewer layers.
- **Cons:**
  - Policy files can be modified, deleted, or disabled by any process with filesystem access.
  - Each runtime adapter implements gate logic independently — divergence is inevitable.
  - A misconfigured adapter (e.g., Hermes with `/yolo`) bypasses all policies.
  - No structural guarantee that gates are actually enforced — relies on adapter cooperation.
  - The `NO_RUNTIME_ADAPTER_OVERRIDE` invariant is structurally impossible.
  - Testing gate enforcement requires testing every adapter × every gate combination.
- **Why rejected:** The purpose of the kernel is to provide **invariant safety guarantees** that are independent of configuration, runtime, or adapter trustworthiness. Policy files alone cannot provide this because they are mutable at the same privilege level as the operations they're meant to constrain.

### Option B: Per-Runtime Kernel Instances

- **Description:** Each runtime (OpenCode, Hermes, Odysseus, Generic) gets its own kernel implementation, optimized for that runtime's specific capabilities and constraints. Kernels share a common gate list but implement them differently.
- **Pros:**
  - Each kernel can leverage runtime-specific features (e.g., OpenCode permissions model, Hermes approval gates).
  - More efficient — no abstraction layer overhead.
  - Easier to debug — runtime-specific code paths are explicit.
- **Cons:**
  - Gate invariants implemented N times → N times the maintenance burden.
  - Drift between implementations is inevitable over time.
  - Adding a new gate requires updating all N kernel instances.
  - A bug in one kernel instance (e.g., Hermes kernel misses a path-safety check) creates a safety gap that only affects that runtime.
  - Testing requires N × M test matrices (N runtimes × M gates).
  - The `NO_RUNTIME_ADAPTER_OVERRIDE` gate cannot be consistently enforced if each runtime runs its own kernel.
- **Why rejected:** The kernel's value proposition is **uniformity** — the same gates, the same invariants, the same decision contract, regardless of runtime. Per-runtime kernels defeat this purpose by reintroducing the divergence problem the kernel is designed to eliminate.

### Option C: Status Quo — No Gate Kernel

- **Description:** Continue with the current architecture: policy files (`write-protection.json`, `evidence-gates.json`, `mcp-trust-tiers.json`) read by bootstrap scripts and agent instructions. No runtime-neutral enforcement layer.
- **Pros:**
  - No new code.
  - No migration cost.
  - Existing workflows continue unchanged.
- **Cons:**
  - No structural enforcement of invariants — everything relies on agent cooperation and policy file integrity.
  - Each new runtime (Odysseus) requires re-implementing all safety checks, with no guarantee of consistency.
  - The 19 kernel gate invariants defined in this ADR exist only as documentation — they have no executable enforcement.
  - Hermes `/yolo` bypass, Odysseus AGPL boundary, and misconfigured OpenCode permissions are all unmitigated.
  - Cross-runtime handoff has no common gate language.
  - Audit trails vary by runtime and are not consistently machine-readable.
- **Why rejected:** As the ecosystem grows to support more runtimes (OpenCode, Hermes, Odysseus, and future agents), the cost of not having a kernel grows linearly with each new runtime. The 19 invariants already identified represent real safety properties that must be guaranteed regardless of which runtime executes an operation. The status quo cannot provide this guarantee.

### Option D: Runtime-Neutral Hard Gate Kernel (CHOSEN)

- **Pros:**
  - **Uniform safety guarantees** across all runtimes — kernel gates are checked identically for OpenCode, Hermes, Odysseus, and Generic.
  - **Single source of truth** for gate logic — one implementation, one test suite, one audit surface.
  - **Structural immutability** — kernel gates cannot be weakened by configuration, policy changes, or adapter behavior.
  - **Machine-auditable decisions** — every gate evaluation produces a JSON decision contract suitable for automated validation and audit logging.
  - **Adapter contract clarity** — the 8-method interface makes adding new runtime adapters predictable and safe.
  - **AGPL boundary enforceable** — `NO_AGPL_INCORPORATION` is a hard kernel gate, not a policy suggestion.
  - **Approval safety** — scope-bound, single-use, non-transferable, expiring approvals are enforced at the kernel level, not the adapter level.
  - **Testable** — kernel gates are pure functions; test coverage is comprehensive and runtime-independent.
- **Cons:**
  - **Architectural complexity** — adds 3 gate layers, 4 adapter implementations, and an approval receipt model to the codebase.
  - **Performance overhead** — every file operation passes through kernel gate validation. For high-frequency operations, this could add measurable latency (mitigated by memoization and caching of gate decisions for repeated operations within the same scope).
  - **Learning curve** — contributors must understand the kernel/adapter contract, the 19 gate invariants, and the approval receipt model.
  - **Maintenance burden** — 19 kernel gates × tests + 4 adapters × tests + approval model × tests = significant test surface area.
  - **Odysseus handoff limitation** — the AGPL boundary means the ecosystem cannot deeply integrate with Odysseus, only hand off structured data. This may limit the richness of the Odysseus experience compared to OpenCode or Hermes.
- **Why chosen:** This is the only option that satisfies all architectural requirements: runtime neutrality, immutable safety invariants, cross-runtime consistency, structural enforcement of the adapter-may-never-weaken contract, and enforceable AGPL boundary. The complexity is the price of the safety guarantees.

---

## Consequences

### Positive

- **Runtime-neutral safety:** Any agent runtime — OpenCode, Hermes, Odysseus, or a future runtime — gets identical kernel gate enforcement. No runtime can offer a "weaker" safety profile.
- **Structural immutability:** The 19 kernel gates cannot be disabled, weakened, or bypassed by any configuration file, policy change, or adapter behavior. They are the floor.
- **Auditable decisions:** Every gate evaluation produces a machine-readable JSON contract. Automated tooling can validate decisions, detect anomalies, and maintain audit trails without understanding runtime-specific formats.
- **Safe runtime expansion:** Adding support for a new runtime requires implementing the 8-method adapter contract. The kernel gates are inherited automatically — no need to re-implement safety checks.
- **Approval integrity:** Scope-bound, single-use, non-transferable, expiring approvals prevent approval reuse, scope creep, and stale-authorization attacks.
- **AGPL compliance:** The `NO_AGPL_INCORPORATION` gate provides structural protection against accidental AGPL contamination, with Odysseus handoff operating at arm's length through structured data exchange.
- **Evidence-gated classification:** `NO_FALSE_GREEN` and `NO_FAKE_EXECUTION` make it impossible to claim success without verifiable evidence. This closes the hallucination gap structurally.
- **Backward compatibility:** The bootstrap flow (dry-run → plan → apply) is unchanged. The kernel gates are an additive safety layer, not a replacement.

### Negative

- **Implementation scope:** 19 kernel gates + 4 runtime adapters + approval receipt model + decision contract + handoff manifests + comprehensive test suites = significant implementation effort. This ADR defines the architecture; implementation is deferred to subsequent work packages.
- **Performance overhead:** Every file operation passes through kernel path-safety, secret-detection, scope-validation, and symlink checks. For projects with many small files, this could measurably slow down bootstrap and apply operations. Mitigations include memoization of repeated checks and batched operation validation.
- **Test surface area:** The full test matrix (19 kernel gates × multiple scenarios + 4 adapters × validation + approval model lifecycle + decision contract edge cases) is extensive. Maintaining test coverage as gates evolve requires discipline.
- **Odysseus limitations:** The AGPL boundary means Odysseus integration is limited to handoff manifests. Deeper integration (shared code, shared skills format, direct MCP bridge) is structurally impossible due to licensing. This may frustrate users who want seamless Odysseus support.
- **Configuration complexity:** Three gate layers (kernel, policy, project) with different mutability rules may confuse contributors about which layer is appropriate for a given constraint.

### Neutral

- The bootstrap process (discovery → manifest selection → merge → apply) is unchanged. The kernel gates are invoked during apply and validation, not during discovery.
- Existing policy files (`.opencode/policies/*.json`) remain the source of truth for configurable rules. The kernel does not replace them — it guarantees that even misconfigured policies cannot violate kernel invariants.
- The Canonical Working Method (WORKING-METHOD.md) remains the human-readable workflow contract. The kernel gates are its structural enforcement layer.
- The repository's living truth mirror (machine truth, technical truth, user truth) is extended with a new layer: **kernel truth** — the set of invariant safety properties guaranteed by the kernel.

---

## References

- [WORKING-METHOD.md](../../WORKING-METHOD.md) — Canonical 24-step workflow contract
- [ADR-0001: Universal Project Bootstrap](../../docs/adr/ADR-universal-project-bootstrap.md) — Layer 1 architecture
- [Canonical Working Method Architecture](canonical-working-method.md) — Layer 2 architecture (this ADR is Layer 3)
- [ecosystem.manifest.json](../../ecosystem.manifest.json) — Machine-readable agent, skill, policy catalog
- [Evidence Gates Policy](../../.opencode/policies/evidence-gates.json) — Mandatory evidence requirements per claim type
- [Write Protection Policy](../../.opencode/policies/write-protection.json) — Human-gate and deny-always rules
- [MCP Trust Tiers Policy](../../.opencode/policies/mcp-trust-tiers.json) — Tool capability classification
- [Data Retention Policy](../../.opencode/policies/data-retention.json) — DSGVO-compliant retention rules
- [ADR Template](../../.opencode/templates/adr-template.md) — Standard ADR format
- OpenCode Configuration Reference: https://opencode.ai/docs/config/
- Hermes Agent Repository: https://github.com/NousResearch/hermes-agent
- Odysseus Agent (AGPL-3.0-or-later): referenced via NousResearch lineage
- AGPL-3.0 License: https://www.gnu.org/licenses/agpl-3.0.html
- Gate Kernel Diagram: [runtime-neutral-gate-kernel.mmd](runtime-neutral-gate-kernel.mmd)
