# URL Installer Runtime Enforcement — Security Review

**Date:** 2026-07-16  
**Commit SHA:** `a5dfb6e4c214f52314ac44aae6705da5258ac86a`  
**Branch:** `feat/url-installer-runtime-enforcement`  
**Review Type:** Read-only structural security review  
**Overall Verdict:** **CHANGES_REQUIRED**

---

## Executive Summary

The canonical governance enforcement system introduces a multi-layered gate evaluation architecture with 19 immutable kernel gates, runtime detection adapters (OpenCode, Hermes, Odysseus), approval receipts with nonce-replay protection, evidence validation, and a dual-runtime hook system (OpenCode plugin + Hermes `pre_tool_call`).

The architecture is fundamentally sound and well-designed for its security posture. However, this review identifies **7 findings requiring changes** (3 MEDIUM, 4 LOW) and **4 advisory notes**. No CRITICAL vulnerabilities were discovered.

The strongest aspect is the fail-closed design: when gate evaluation crashes or is unavailable, write/external tools are blocked. The weakest aspect is that the **OpenCode plugin hook uses an advisory-fire pattern** — meaning there is no contractual guarantee OpenCode will actually call `tool.execute.before` before every tool execution, and no detection mechanism exists if a user disables the plugin.

---

## Finding Summary

| # | Severity | Category | File | Status |
|---|----------|----------|------|--------|
| F1 | **MEDIUM** | Hook Bypass (OpenCode) | `.opencode/plugins/canonical-governance.mjs` | CHANGES_REQUIRED |
| F2 | **MEDIUM** | Bootstrap Bypass Path | `scripts/bootstrap-project.mjs` | CHANGES_REQUIRED |
| F3 | **MEDIUM** | TOCTOU: Hash → Execution | `scripts/install-governance.mjs` | CHANGES_REQUIRED |
| F4 | **LOW** | Fail-Open for READ Tools | `.opencode/plugins/canonical-governance.mjs` | Advisory |
| F5 | **LOW** | Hermes Write-Path Check Gap | `integrations/hermes/gate_hook.py` | CHANGES_REQUIRED |
| F6 | **LOW** | Nonce Ledger Cross-Process Race | `scripts/lib/gates/approval.mjs` | Advisory |
| F7 | **LOW** | Symlink Detection Incomplete | `scripts/lib/gates/kernel.mjs` (L161-195) | CHANGES_REQUIRED |
| N1 | NOTE | Plugin Deactivation Undetectable | `.opencode/plugins/canonical-governance.mjs` | Accepted Risk |
| N2 | NOTE | Governing Policy Weakening | `scripts/lib/gates/evidence.mjs` | Design Decision |
| N3 | NOTE | Shell Encoding Bypass | `scripts/lib/gates/kernel.mjs` (L62-73) | Accepted Risk |
| N4 | NOTE | Odysseus Honest Classification | `scripts/lib/runtimes/odysseus.mjs` | Verified |

---

## Finding 1 (MEDIUM): OpenCode Hook Bypass — No Contractual Guarantee

### File
`.opencode/plugins/canonical-governance.mjs`

### Finding
The OpenCode governance hook is exported as `hooks['tool.execute.before']`. However, OpenCode's plugin system does **not** provide a contractual guarantee that `tool.execute.before` will be invoked before every tool execution. OpenCode plugins are **advisory interceptors**, not mandatory enforcement contracts.

The code itself exemplifies this with the `question` tool — classified as `NON_BLOCKING` in the `SAFE_TOOLS` set (line 16), yet `question` is not a tool that triggers this hook in the standard OpenCode runtime tool dispatch.

**Evidence:**
```javascript
// Line 16-17: SAFE_TOOLS = new Set(['question', 'todowrite']);
// Lines 285-288: The hook is exported but there is no mechanism to:
//   1. Verify the hook is actually registered in the OpenCode instance
//   2. Detect if the plugin was disabled before OpenCode started
//   3. Prevent a user from starting OpenCode without this plugin
```

### Concrete Bypass Scenario
1. User runs `opencode --no-plugins` or removes the plugin from `opencode.jsonc`
2. The hook is never loaded
3. No detection mechanism exists — the governance falls back to "governance not installed" only if `.agent-governance/manifest.json` is missing, which would still be present
4. All tool operations proceed un-gated

### Recommendation
Add a **resident verification mechanism**: a start-of-session check via a `plugin.activate` hook that:
1. Emits a unique session nonce to evidence directory
2. Any tool execution checks for this nonce
3. If the nonce is missing on tool execution, the tool should be blocked in layers that CAN enforce it

Alternatively, document this as an explicit acceptance that OpenCode enforcement is **advisory only** and the primary enforcement layer is Hermes `pre_tool_call` + `scripts/evaluate-gates.mjs` CLI + filesystem-level write protection.

### CVSS 3.1 Vector (Advisory)
`CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:L/E:P/RL:T/RC:C` → **4.4 (MEDIUM)**

| Metric | Value | Justification |
|--------|-------|--------------|
| AV | Local | Requires local OpenCode session |
| AC | Low | Simple to bypass — just disable the plugin |
| PR | Low | Any OpenCode user with edit permissions |
| UI | None | No user interaction needed after disable |
| S | Unchanged | Scope is contained to local project |
| C/I/A | N/L/L | Integrity (unauthorized writes) + Availability (destruction through `execute_unchecked`) possible |

---

## Finding 2 (MEDIUM): Bootstrap Apply Can Proceed Without Gate Check

### File
`scripts/bootstrap-project.mjs` (Lines 63-77, 88-95, 128-136)

### Finding
The bootstrap script evaluates gates in `runDryRunPhase` and `runApplyPhase`. However, there are **two distinct code paths** where apply can proceed despite gate evaluation:

**Path A — AMBER_REVIEW bypass (Line 145-150):**
```javascript
if (applyGateDecision.classification === CLASSIFICATIONS.AMBER_REVIEW) {
    console.warn("AMBER_REVIEW: Proceeding with apply as explicitly requested.");
    // ... continues to applyOverlay(overlay) without blocking
}
```
This means that if any policy gate, project gate, or adapter returns AMBER_REVIEW (e.g., comment policy violations, HERMES_YOLO_MODE), the apply still proceeds. The only gate classification that blocks is RED_BLOCK.

**Path B — TOOL_GAP bypass (Line 138-143):**
Similarly, `TOOL_GAP` classification only prints a warning and continues.

**Evidence:**
The `evaluateAllGates` invocation at line 114-127 uses `riskTier: "LOW_LOCAL"` — the LOW_LOCAL tier skips many approval gates (see `decision.mjs` line 194), and `hasBackup: true` in the enforcement context satisfies the `NO_APPLY_WITHOUT_BACKUP` kernel gate.

### Assessment
This is by design (AMBER_REVIEW is advisory by nature), but the "bootstrap can apply without gate check" claim is misleading. The bootstrap **always** runs gates, but gates classified as AMBER_REVIEW only warn, they don't block. The system correctly blocks only on RED_BLOCK.

### Recommendation
Document clearly that AMBER_REVIEW and TOOL_GAP classifications are **advisory warnings**, not blocks. The bootstrap is correctly wired to `evaluateAllGates`. Consider adding a `--strict` flag that treats AMBER_REVIEW as RED_BLOCK to provide a higher-security bootstrap path.

---

## Finding 3 (MEDIUM): TOCTOU Between Hash Verification and Execution

### Files
`scripts/install-governance.mjs` (Lines 399-426) and `.opencode/plugins/canonical-governance.mjs` (Lines 43-66)

### Finding
**Install time:** Source lock hashes are generated in `generateSourceLock()` (Line 399-426), then the files are copied in `copyRuntimeFiles()` (Lines 370-383). The file copy occurs BEFORE hash generation, so the hash reflects the **already-copied file**. A race condition between file copy and hash verification is not present because the hash is pre-computed.

**Runtime:** `validateRuntimeIntegrity()` (canonical-governance.mjs lines 43-66) loads the lock file, reads each runtime file by path, hashes it, and compares. Between the hash verification and the subsequent `evaluateByGate()` call (line 209):
- The file could be tampered with **after** integrity check passes
- `evaluateByGate()` loads `evaluate-all.mjs` via dynamic `import()`, which is Node.js module caching — once loaded, the module stays in memory

**Timeline:**
1. T0: `validateRuntimeIntegrity()` reads and hashes `runtime/evaluate-all.mjs` → passes
2. T1: Attacker replaces `runtime/evaluate-all.mjs` with malicious version
3. T2: `loadEvaluateModule()` calls `import(EVALUATE_PATH)` — but this was already imported in step 1's integrity check? No, `validateRuntimeIntegrity` uses `readFileSync`, not `import`. `loadEvaluateModule` uses `import()` which reads the file again.

However, Node.js caches dynamic `import()` results per URL. The first `import()` call at T2 would read the (now-tampered) file and execute it. This is a valid TOCTOU window, albeit with a very tight race condition (sub-millisecond in practice).

### Assessment
**Practical exploitability is LOW** because:
1. The attacker needs filesystem write access at runtime (already a severe breach)
2. The window between hash check and import is one synchronous code block
3. Node.js `import()` also runs the module's top-level code, so any malicious code executes immediately

### Recommendation
- Combine `validateRuntimeIntegrity` and `loadEvaluateModule` into a single atomic operation: read the file, hash it, verify against lock, then eval/import the same buffer content.
- Or use Node.js `vm.Module` with the already-read buffer to avoid a second disk read.

---

## Finding 4 (LOW): Fail-Open for READ Tools When Gate Evaluation Crashes

### File
`.opencode/plugins/canonical-governance.mjs` (Lines 208-228)

### Finding
When gate evaluation throws an exception (line 210), the error handler at lines 220-226 correctly blocks WRITE and EXTERNAL tools. However, for READ, DELEGATE, and NON_BLOCKING tools, the code falls through to `return undefined` (line 227), which means **open-channel pass**.

This is intentional (reads don't pose write risk), but in the context of DELEGATE tools (`task`, `skill`), a crash in gate evaluation would allow delegation to a sub-agent that could then perform write operations with an un-gated session.

### Evidence:
```javascript
// Lines 220-227:
if (risk === 'WRITE' || risk === 'EXTERNAL') {
    throw new Error(...);  // ← fail-closed for write/external
}
return undefined;  // ← fail-open for READ/DELEGATE/NON_BLOCKING
```

### Recommendation
For DELEGATE tools specifically, consider fail-closed behavior. If gate evaluation is unavailable, delegation should not proceed unchecked. Alternatively, ensure the delegated sub-agent loads its own governance plugin independently.

---

## Finding 5 (LOW): Hermes Write-Path Check Only Checks Governance Root

### File
`integrations/hermes/gate_hook.py` (Lines 111-118)

### Finding
The Hermes write-path escape check uses the governance root as the boundary:

```python
if not wp_abs.startswith(gov_root_str) and not wp_abs.startswith("/tmp/"):
    return { "action": "block", ... }
```

This has two issues:

1. **Governance root is NOT the project root**: `gov_root` is where `.agent-governance/manifest.json` is found, which could be a parent directory. The check should use the **project root** (cwd), not the governance root. A write to a sibling project could pass.

2. **Hardcoded `/tmp/` exception**: Writes to `/tmp/` are unconditionally allowed. While convenient, this could be exploited to write a malicious script to `/tmp/` that later gets executed by an un-gated bash command.

### Evidence:
The `_find_governance_root()` function walks up from CWD to find `.agent-governance/manifest.json`. If governance is installed at `~/projects/`, a write to `~/projects/other-app/secret.txt` would pass because it starts with `~/projects/` (the governance root).

### Recommendation
- Change the boundary check to use `os.getcwd()` (the project root), not the governance root
- Restrict the `/tmp/` exception to be at most the project's temporary directory, not system-wide `/tmp/`

---

## Finding 6 (LOW): Nonce Ledger — Cross-Process Race Condition

### File
`scripts/lib/gates/approval.mjs` (Lines 185-297)

### Finding
The nonce ledger uses an **in-memory Set** (`consumedNonces` at line 369) PLUS a filesystem ledger (`writeReceiptToLedger`). The consumption path is:

1. Check in-memory Set (line 190)
2. Read from filesystem ledger (line 191)
3. Check status fields (lines 204-276)
4. Add to in-memory Set (line 279)
5. Write to filesystem ledger (line 290)

Between steps 3 and 4, a **concurrent process** could also check the same nonce and both processes would pass because neither has marked it consumed yet.

### Assessment
**Practical exploitability is LOW** because:
1. Requires two concurrent approval consumption attempts
2. Both would need valid approval receipts
3. The filesystem `writeFileSync` (non-atomic) at step 5 is a best-effort cross-process protection

### Recommendation
- Use atomic filesystem operations: `writeFileSync` with `{ flag: 'wx' }` (exclusive create) for the ledger file. If the file already exists, the second process fails.
- Or use `flock`/`fcntl` advisory locks on the ledger file.

---

## Finding 7 (LOW): Symlink Detection via `realpathSync` Is TOCTOU-Sensitive

### File
`scripts/lib/gates/kernel.mjs` (Lines 161-195, specifically L174)

### Finding
The `NO_SYMLINK_ESCAPE` gate uses `realpathSync` to resolve symlinks:

```javascript
const realPath = realpathSync(normalized);
```

However, the resolved realpath is then compared against the worktree root. The issue: `realpathSync` resolves **all** symlinks in the path to their final location, but there is a gap:

1. If a **new** symlink is created between the `existsSync` check (line 172) and the `realpathSync` call (line 174), the `realpathSync` will resolve what's at the path NOW, which could be different from what was checked with `existsSync`.

### Assessment
This is a standard TOCTOU class vulnerability. The window is extremely narrow (single synchronous code block). However, combined with the `existsSync` → `realpathSync` gap, it's theoretically exploitable.

Additionally, the `realpathSync` resolution for a **symlink chain** (symlink → symlink → file) might not correctly attribute the original path component. If the intermediate symlinks point within the worktree but the final target points outside, `realpathSync` would detect it. The gate logic is: if `realPath !== resolved` AND the relative path from worktree to realPath starts with `..`, it's a violation. This is **correct** — the gate catches the escape.

### Recommendation
- Minor: Add a comment documenting that the `existsSync` → `realpathSync` window is accepted as a design choice
- Consider using `lstatSync` for each path segment (as `assertSafePath` in `paths.mjs` does) for more granular symlink detection

---

## Advisory Notes

### N1: Plugin Deactivation Is Undetectable (Accepted Design Risk)
If a user deactivates the `canonical-governance` plugin from `opencode.jsonc`, or starts OpenCode with `--no-plugins`, there is no detection mechanism. The governance system relies on file presence of `.agent-governance/manifest.json` for the "governance installed" check, but the plugin itself can be disabled independently. This is an accepted design constraint — OpenCode plugins are advisory, and the enforcement model relies on multiple layers (CLI, filesystem permissions, Hermes hooks) rather than any single enforcement point.

### N2: Policy Can Add Gates But Cannot Remove — Verified Correct
The evidence gate policy system (`scripts/lib/gates/evidence.mjs`, Lines 258-300) correctly implements additive-only merging. External policies can ADD new evidence requirements but cannot REMOVE existing ones. The `MINIMUM_EVIDENCE_REQUIREMENTS` (line 21) is a hardcoded floor. **Design is sound.**

### N3: Shell Encoding Bypass — Known Limitation
The `determineBashAction` function in `canonical-governance.mjs` (lines 89-112) uses regex patterns to classify bash commands. This is inherently bypassable through shell encoding (e.g., `bash -c "$(echo cmggIC1yZg== | base64 -d)"`). The destructive command patterns (`rm -rf`, `DROP TABLE`, `format`, etc.) are straightforward string matches. This is a **known and accepted limitation** — bash-level security must be enforced at the filesystem/sandbox level, not by regex.

### N4: Odysseus Honest Classification Verified
The Odysseus adapter (`scripts/lib/runtimes/odysseus.mjs`) honestly classifies its integration as `MANUAL_IMPORT` with `nativeIntegration: false` (line 403). The `generateHandoff` function explicitly states: "Odysseus has NO native import API for external agent rules." (line 407). This is the correct, honest classification per the False Enforcement Claims check.

---

## Cross-Cutting Checks

### Absolute User Paths in New Files
✅ **PASS** — No absolute user paths (`/home/*`, `/Users/*`) found in any new files. The `context-fingerprint.mjs` file correctly redacts paths with `redactPath()`.

### Secrets in Source Code
✅ **PASS** — No actual secrets found. The `kernel.mjs` file contains regex patterns for **detecting** GitHub tokens (`ghp_`, `gho_`, etc.), which is correct for a secret leak detection gate. References to `BRAVE_API_KEY` are environment variable names, not values.

### Destructive Commands Blocked
✅ **PASS** — Both the OpenCode plugin (lines 90-97) and Hermes hook (lines 97-108) block destructive patterns: `rm -rf`, `git push --force`, `DROP TABLE`, `docker rm -f`, `format`, `chmod 777`.

### AGPL Code Incorporation
✅ **PASS** — No AGPL-licensed source code is incorporated. The `NO_AGPL_INCORPORATION` kernel gate (line 520-571) correctly detects and blocks AGPL source. The Odysseus adapter generates handoff artifacts only (no source code copying). All files in this repository are under the project's existing license.

### Public Network Binding
✅ **PASS** — No server listening on `0.0.0.0`. The Odysseus adapter detects and flags `APP_BIND=0.0.0.0` / `ODYSSEUS_HOST=0.0.0.0` as RED_BLOCK when `AUTH_ENABLED=false`. Docker port mappings to `0.0.0.0` / `::` are also detected and blocked.

### Hermes Hook Ordering
✅ **PASS** — The `pre_tool_call_handler` in `gate_hook.py` is registered via `ctx.register_hook("pre_tool_call", pre_tool_call_handler)` in `__init__.py`. The `plugin.yaml` declares `provides_hooks: ["pre_tool_call"]`. Assuming Hermes follows its own documented hook firing order (pre_tool_call fires before tool dispatch), the hook ordering is correct.

### Adapter Downgrade Prevention
✅ **PASS** — The `validateAdapterAgainstKernel` function in `contract.mjs` (lines 78-112) detects three categories of adapter downgrade:
1. `ADAPTER_MASKED_KERNEL_BLOCK` — adapter claimed GREEN_SAFE when kernel blocked
2. `ADAPTER_RECLASSIFIED_RED_BLOCK` — adapter reclassified RED_BLOCK to something else
3. `ADAPTER_FALSE_LIVE_CLAIM` — adapter claimed LIVE_INTEGRATION_PASS without performing live verification

These are enforced in `evaluate-all.mjs` lines 304-319.

### Approval Replay Prevention
✅ **PASS** — The dual-layer nonce system (in-memory Set + filesystem ledger) provides single-use enforcement. The `consumeReceipt` function checks for:
- Already consumed nonce (line 190, 204)
- Expired receipts (line 214, 225)
- Cross-action mismatch (line 233)
- Cross-scope mismatch (line 244, 256, 267)

### False Enforcement Claims
✅ **PASS** — No false HOOK_ENFORCED claims without evidence. The `determineEnforcementLevel` function in `install-governance.mjs` (lines 214-228) only claims HOOK_ENFORCED when:
- A runtime is detected with confidence ≥ 50
- The OpenCode adapter has hook support (confidence ≥ 80)

Otherwise, it falls back to STRUCTURAL_ONLY or ADVISORY_ONLY.

---

## Design Review Summary

### Architecture Strengths
1. **Layered Evaluation**: Kernel → Policy → Project → Adapter — each layer can only ADD restrictions
2. **Fail-Closed Default**: When gate evaluation throws or is unavailable, write/external tools are blocked
3. **19 Immutable Kernel Gates**: `Object.freeze()` and `kernel: true` flags prevent runtime weakening
4. **Adapter Integrity Validation**: `validateAdapterAgainstKernel` catches downgrade/masking attempts
5. **Honest Odysseus Classification**: Explicitly admits no native integration — handoff-only
6. **No Short-Circuit**: All gates evaluate even if kernel already blocked (line 14 in evaluate-all.mjs design invariants)
7. **Cross-Process Nonce Ledger**: In-memory + filesystem dual-layer replay prevention

### Architecture Weaknesses
1. **No Hook Registration Verification**: Cannot detect if the OpenCode plugin was not loaded
2. **AMBER_REVIEW Is Advisory**: Bootstrap applies proceed even with AMBER_REVIEW classification
3. **TOCTOU Windows**: Between hash verification and module loading; symlink resolution
4. **Regex-Based Command Classification**: Inherently bypassable through shell encoding

---

## Remediation Priority

| Priority | Finding | Action |
|----------|---------|--------|
| **P0** | F1: OpenCode Hook Bypass | Add session nonce verification mechanism or document as advisory-only |
| **P1** | F3: TOCTOU Hash→Import | Combine integrity check and module loading into single atomic operation |
| **P2** | F5: Hermes Write-Path Gap | Use CWD as boundary, not governance root; restrict /tmp/ exception |
| **P3** | F6: Nonce Ledger Race | Use atomic exclusive-create for filesystem ledger |
| **P4** | F7: Symlink TOCTOU | Add documentation; consider path-segment traversal check |
| **P5** | F4: Delegation Fail-Open | Consider fail-closed for DELEGATE tools |

---

## Review Signature

- **Reviewer:** Security Agent (Codex)
- **Commit Reviewed:** `a5dfb6e4c214f52314ac44aae6705da5258ac86a`
- **Scope:** All new/modified files in working tree for URL installer enforcement feature
- **Files Examined:** 29 files (see git diff --stat)
- **Methodology:** Read-only structural analysis + logic review + pattern matching
- **Limitations:** No live runtime testing performed; review is STRUCTURAL only
- **Evidence Level:** STRUCTURAL_PASS (no live execution evidence)
