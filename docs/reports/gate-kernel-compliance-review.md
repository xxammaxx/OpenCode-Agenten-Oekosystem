# Gate Kernel Architecture — AGPL License & DSGVO Compliance Review

**Date:** 2026-07-15
**Reviewer:** Compliance Agent
**Architecture Under Review:** ADR-003 Runtime-Neutral Hard Gate Kernel
**Source Document:** `docs/architecture/runtime-neutral-gate-kernel.md`
**Classification:** `AMBER_REVIEW` — architecture is fundamentally sound; 8 findings require remediation before implementation.
**Jurisdiction:** DE (DSGVO)
**Risk Tier of Subject:** HIGH_HUMAN_GATE

---

## Executive Summary

The proposed Runtime-Neutral Hard Gate Kernel (ADR-003) is **architecturally compliant** with both AGPL-3.0 license boundaries and DSGVO data protection principles. The design demonstrates careful consideration of the AGPL copyleft boundary for Odysseus integration and embeds several DSGVO-aligned features (scope-bound approvals, evidence minimization, structural immutability of data protection gates).

However, **eight findings** (3 AGPL boundary concerns, 5 DSGVO protection gaps) must be resolved before the architecture can be declared fully compliant:

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| AGPL-01 | HIGH | License Boundary | The ecosystem has no declared license — AGPL boundary analysis is based on assumption of MIT |
| AGPL-02 | MEDIUM | License Boundary | `app.py` header inspection (first 512 bytes) must not retain source code excerpts |
| AGPL-03 | LOW | License Boundary | Adapter `plan()` method referencing Odysseus architecture facts may need legal review |
| DSGVO-01 | HIGH | Data Minimization | `context_fingerprint` (SHA-256 of state) could inadvertently capture PII if state includes user paths |
| DSGVO-02 | MEDIUM | Right to Deletion | No deletion mechanism specified for gate decision evidence files |
| DSGVO-03 | MEDIUM | Retention | No retention policy defined for approval receipts, consumed nonces, and gate audit logs |
| DSGVO-04 | MEDIUM | Email/Calendar | Gate model separates read/write but does not gate read operations for email/calendar |
| DSGVO-05 | LOW | PII Leakage | `blocked_by.evidence` field could contain user-specific command strings with paths |

---

## 1. AGPL License Boundary Assessment

### 1.1 Ecosystem License Status

**Finding AGPL-01 (HIGH):** The ecosystem repository has **no LICENSE file**. The `ecosystem.manifest.json` contains no license field. The ADR-003 document refers to the ecosystem as "MIT? unlicensed?" — this ambiguity must be resolved before legal analysis can be definitive. If the ecosystem is actually unlicensed (all rights reserved by default under copyright law), the AGPL boundary is even more critical because there is no open-source license to act as a bridge.

**Recommendation:** Add an explicit `LICENSE` file (recommend MIT or Apache-2.0 for a bootstrap kit) before implementing the Odysseus adapter. Without a declared license, the legal baseline is "all rights reserved," which makes the AGPL boundary analysis speculative.

**Assumption for the remainder of this review:** The ecosystem will be licensed under a permissive license (MIT or Apache-2.0) that is compatible with AGPL-vicinity but not AGPL itself.

---

### 1.2 Handoff-Only Approach — AGPL Incorporation Analysis

**Assessment: PASS (with conditions)**

The proposed handoff-only approach for Odysseus does **NOT** constitute AGPL code incorporation, provided the following conditions are met:

#### What the architecture proposes (FACT):

1. **Detection at arm's length:** The Odysseus adapter (`adapter-odysseus.mjs`) detects Odysseus by checking for the **presence** of signal files/directories (`integrations/claude/`, `integrations/codex/`, `companion/`, `app.py`, `data/skills.json`, `data/presets.json`). This is a filesystem existence check — `fs.existsSync()` or equivalent.

2. **No import/require of Odysseus code:** The architecture explicitly states: "The ecosystem must never `import`, `require()`, `fs.readFile()`, or otherwise load Odysseus source files into its own process space." (Gate 19, line 758)

3. **Handoff via structured JSON:** The ecosystem produces a `handoff_manifest.json` that Odysseus reads independently. The manifest contains "structured data: skill names, policy references, gate decisions, evidence requirements" — never ecosystem or Odysseus source code.

4. **No vendoring/submodule:** "Odysseus code must never be copied into the ecosystem's source tree, even as a git submodule."

#### Legal analysis under AGPL-3.0:

Under AGPL-3.0 Section 5, the "copyleft" trigger activates when you "convey a work based on the Program" — where "based on" means modification, or a work that "contains" or is "derived from" the Program. The FSF's interpretation and legal consensus identify the following as triggering copyleft:

| Action | AGPL Trigger? | Architecture Does? |
|--------|---------------|-------------------|
| `import` / `require()` of AGPL modules | **YES** — creates a combined work at runtime | **NO** — explicitly prohibited by Gate 19 |
| Copying AGPL source into own source tree | **YES** — direct incorporation | **NO** — explicitly prohibited by Gate 19 |
| Dynamic linking / loading AGPL shared libraries | **YES** (disputed, but conservative reading says yes) | **NO** — no linking of any kind |
| Reading AGPL source to extract facts/APIs/documentation | **GRAY AREA** — depends on what is extracted and how | **LIMITED** — see AGPL-02 below |
| Communicating via structured data exchange (JSON, REST, CLI) | **NO** — arm's length communication is not derivation | **YES** — this is the handoff approach |
| Checking file existence in a directory | **NO** — filesystem metadata is not copyrighted expression | **YES** — multi-signal detection |
| Writing configuration files that an AGPL program reads | **NO** — data files consumed by a program do not create a derivative | **YES** — handoff manifests |

**Conclusion:** The handoff-only architecture correctly implements the **arm's length** principle. The ecosystem never links to, imports, or incorporates Odysseus code. The structured data exchange (JSON handoff manifest) is the canonical safe harbor under copyright law — data is not code, and format translation does not create a derivative work.

#### Critical guardrail — Gate 19 (NO_AGPL_INCORPORATION):

Gate 19 provides **structural enforcement** of the AGPL boundary. It triggers `RED_BLOCK` on:
- Any file read of AGPL-3.0-or-later licensed code within the ecosystem's source tree
- Any dependency resolution that would pull in AGPL code
- Any attempted import/require/vendor of Odysseus modules

This gate is in **Layer 1 (Kernel Gates)** — meaning it cannot be weakened by any runtime adapter, policy file, or project configuration. This is the correct architectural placement for a legal boundary constraint.

---

### 1.3 Multi-Signal Detection — AGPL Safety Analysis

**Assessment: PASS (with one condition)**

The multi-signal detection approach checks for file **presence** (not content) of:
- `integrations/claude/` directory
- `integrations/codex/` directory
- `companion/` directory
- `app.py` file
- `data/skills.json` file
- `data/presets.json` file

These are filesystem metadata operations (`fs.existsSync()`, `fs.statSync()`, `fs.readdirSync()`). Under copyright law:

1. **File/directory names are facts, not expression:** A directory named `integrations/claude/` is a functional organizational choice, not a copyrightable creative work. The *name itself* does not enjoy copyright protection.

2. **Filesystem existence checks do not access copyrighted content:** `fs.existsSync()` reads directory entry metadata — inode information — not file contents. No copyrighted expression is accessed, copied, or derived.

3. **The confidence scoring algorithm is independent creative work:** The algorithm that assigns weights (25, 25, 20, 15, 10, 5) to signal matches is original code written for this ecosystem. It does not derive from any Odysseus algorithm.

**Conclusion:** Multi-signal detection via file/directory existence checks is **AGPL-safe**. No copyrighted expression from Odysseus is accessed, copied, or incorporated.

#### Condition — `app.py` header inspection:

**Finding AGPL-02 (MEDIUM):** The ADR mentions reading "the first 512 bytes of `app.py` for license header detection." This crosses the threshold from filesystem metadata to **file content reading**. While 512 bytes is minimal and specifically targets the license header (which is the legal notice, not the creative work), this creates a minor AGPL concern:

- If the 512 bytes are **read into a variable and stored** (even temporarily in memory), a strict reading could argue that this constitutes "copying" a portion of the AGPL-licensed work into the ecosystem's process.
- If the 512 bytes are **immediately inspected for a license string match and discarded** without retention, this is closer to the "fair use" / "Schrankenbestimmung" (§ 69d UrhG for interoperability, § 44a for transient copies) analysis.

**Recommendation:** 
1. Do NOT store the 512 bytes. Use a streaming read with immediate discard after regex match.
2. Alternatively, avoid reading `app.py` entirely — use only directory-structure signals, which already provide 80+ confidence. The `app.py` signal (weight 15) can be inferred from `pyproject.toml` project name or directory pattern matching without reading file contents.
3. Document the license detection as an **ephemeral operation** — no excerpt retention in memory beyond the pattern match.

---

### 1.4 Adapter Methods Referencing Odysseus Architecture Facts

**Assessment: PASS (with legal review note)**

**Finding AGPL-03 (LOW):** The Odysseus adapter's `detect()`, `capabilities()`, and `plan()` methods reference **facts about Odysseus** — its directory structure, skills format (`data/skills.json`), Docker socket behavior, network binding defaults, etc. These are **discoverable facts** about a software system, not copyrightable expression.

Under copyright law:
- **Facts are not copyrightable** (Feist Publications v. Rural Telephone Service, 499 U.S. 340; also recognized in German/EU law under § 69a UrhG — ideas and principles underlying a computer program are not protected).
- The **architecture, API surface, file layout, and behavioral characteristics** of a software program are functional/ factual elements, not creative expression.
- Documenting that "Odysseus binds to `127.0.0.1` by default" or "Odysseus uses `data/skills.json` for skills" is equivalent to documenting the API behavior of any software — it does not reproduce the expression that implements that behavior.

**However**, the adapter's methods should:
1. **NOT** contain verbatim excerpts from Odysseus source files (even comments or variable names in bulk).
2. **NOT** replicate Odysseus's creative structural patterns (e.g., copying its module hierarchy).
3. Reference only **externally observable behavior** and **publicly documented facts** from the Odysseus README, SECURITY.md, THREAT_MODEL.md, and repository structure — all of which were read during the research phase but not copied.

**Recommendation:** Add a comment header to `adapter-odysseus.mjs`:
```javascript
// AGPL BOUNDARY NOTE: This adapter references publicly documented facts about
// Odysseus (AGPL-3.0-or-later). No Odysseus source code is imported, read at
// runtime, vendored, or incorporated. All interaction is at arm's length via
// structured data exchange. See ADR-003, Gate 19 (NO_AGPL_INCORPORATION).
```

**Legal review note:** While this analysis is based on established copyright principles, the boundary between "facts about a program" and "derived expression" in the context of AGPL copyleft is litigated territory. A formal legal review by an IP attorney specializing in open-source licensing is recommended before the Odysseus adapter ships.

---

### 1.5 AGPL Boundary Summary

| Aspect | Verdict | Condition |
|--------|---------|-----------|
| Handoff-only approach (JSON manifests) | ✅ PASS | Must remain strictly data exchange, no code integration |
| Multi-signal detection (file presence) | ✅ PASS | No content reading beyond what's necessary for AGPL-02 |
| `app.py` header inspection (512 bytes) | ⚠️ AGPL-02 | Use streaming read with immediate discard, or avoid entirely |
| Adapter methods referencing Odysseus facts | ✅ PASS (AGPL-03) | Legal review recommended before shipping |
| Gate 19 (NO_AGPL_INCORPORATION) | ✅ PASS | Correctly placed in Layer 1 (kernel gates, immutable) |
| Ecosystem LICENSE declaration | ❌ AGPL-01 (HIGH) | Must add explicit LICENSE file |

---

## 2. DSGVO Data Protection Assessment

### 2.1 Data Flow Through Kernel Gates

Before analyzing individual DP concerns, understanding the data flow is essential for compliance assessment.

```
┌─────────────────────────────────────────────────────────────────────┐
│ INPUT                         │ GATE LAYER          │ OUTPUT        │
├───────────────────────────────┼─────────────────────┼───────────────┤
│ Operation Request:            │                     │               │
│ • action (push/commit/apply)  │ 1. Kernel Gates     │ Gate Decision │
│ • scope_paths (file globs)    │    • Command string  │ (JSON)        │
│ • runtime identifier          │    • File paths      │               │
│ • repository URL              │    • Scope paths     │ • allowed     │
│ • branch name                 │    • Approval nonces │ • blocked_by  │
│                               │    • Backup hashes   │ • approvals   │
│ Project State:                │    • License checks  │ • evidence    │
│ • git tree hash               │                     │ • tool_gaps   │
│ • file list (paths only)      │ 2. Policy Gates     │ • warnings    │
│ • policy JSON files           │    • Risk tier       │ • timestamp   │
│ • project config              │    • Evidence reqs   │               │
│                               │    • Security rules  │ Approval      │
│ Runtime Signals:              │    • Compliance      │ Receipts      │
│ • opencode.jsonc presence     │    • Retention rules │               │
│ • .hermes.md presence         │                     │ • receipt_id  │
│ • odysseus signals (dirs)     │ 3. Project Gates    │ • nonce       │
│ • Docker socket status        │    • local-only      │ • action      │
│ • Network binding address     │    • no cloud LLM    │ • scope_paths │
│                               │    • protected files │ • fingerprint │
│                               │    • no remote CI    │ • timestamps  │
│                               │    • no production   │ • status      │
│                               │                     │               │
│                               │ 4. Runtime Adapter  │ Handoff       │
│                               │    • capabilities   │ Manifests     │
│                               │    • runtime gates  │               │
│                               │    • tool gaps      │ • skill names │
│                               │                     │ • policies    │
│                               │                     │ • gates       │
│                               │                     │ • evidence    │
└───────────────────────────────┴─────────────────────┴───────────────┘
```

**Compliance-relevant data points** (marked with ⚠️ below):

| Data Point | PII Risk | DSGVO Relevance |
|------------|----------|-----------------|
| Command strings | ⚠️ Could contain user-specific paths or secrets | Art. 5(1)(c) — minimization |
| File paths (scope) | ⚠️ Project paths could reveal usernames (e.g., `~/project`) | Art. 4(1) — personal data if user-identifiable |
| Repository URL | ⚠️ Could contain GitHub username (e.g., `github.com/alice/repo`) | Art. 4(1) — personal data |
| Branch names | ✅ Generic — rarely contains PII | — |
| Approval nonces | ✅ Cryptographically random — no PII | — |
| Git tree hash | ✅ Content hash — no PII by itself | — |
| `context_fingerprint` | ⚠️ SHA-256 of state — see DSGVO-01 | Art. 5(1)(c) — must not embed PII |
| Runtime identifier | ✅ Version string (e.g., `opencode-1.15.13`) — no PII | — |
| Docker socket status | ✅ Boolean — no PII | — |
| Network binding address | ⚠️ Could reveal internal network topology | Art. 32 — security-relevant, not PII per se |
| Tool gap classifications | ✅ Enum values — no PII | — |
| Handoff manifest: skill names | ✅ Application data — no PII | — |
| Handoff manifest: policy references | ✅ File references — no PII | — |

---

### 2.2 Evidence Retention — DSGVO-Relevant Data

**Assessment: AMBER_REVIEW — DSGVO-01, DSGVO-02, DSGVO-03**

#### What evidence files does the kernel generate?

The kernel generates the following evidence artifacts:

| Artifact | Content | Storage Location | Contains PII? |
|----------|---------|-----------------|---------------|
| **Gate decision JSON** | `blocked_by`, `required_approvals`, `required_evidence`, `present_evidence`, `warnings`, `tool_gaps`, `classification`, `decision_timestamp` | `.opencode/reports/gates/` (proposed) | ⚠️ Potentially (see DSGVO-01, DSGVO-05) |
| **Approval receipts** | `receipt_id`, `nonce`, `action`, `runtime`, `repository`, `branch`, `scope_paths`, `context_fingerprint`, timestamps, `approved_by` | `.opencode/approvals/` (proposed) | ⚠️ `repository` URL could contain GitHub username; `scope_paths` could contain user paths |
| **Consumed nonce ledger** | Nonce + timestamp of consumption | `.opencode/approvals/consumed.json` (proposed) | ✅ No — cryptographic nonces only |
| **Handoff manifests** | Skill names, policy references, gate decisions, evidence requirements | Project root or `.agent-governance/odysseus/` | ✅ No (by design — structured data only) |
| **Audit logs** | Sequential log of all gate evaluations with decisions | `.opencode/logs/audit/gate-kernel.log` (proposed) | ⚠️ Aggregates all the above |
| **Backup manifests** | SHA-256 hashes of backed-up files, paths | `.opencode/backups/manifest.json` | ⚠️ File paths could reveal user identity |
| **Tool gap reports** | Missing tools, runtime capabilities | Embedded in gate decision JSON | ✅ No — enum values only |

#### DSGVO-01: `context_fingerprint` PII Risk (HIGH)

**Finding DSGVO-01 (HIGH):** The approval receipt schema defines `context_fingerprint` as `"sha256(current-state)"` and specifies it as "SHA-256 hash of the relevant repository state at approval time (git tree hash, affected file list, risk tier, verification contract hash)."

The concern is **what goes into the SHA-256 hash**. If the `current-state` input includes:
- Absolute file paths containing home directory usernames (e.g., `~/project/src/main.js`)
- Repository URLs containing GitHub usernames (e.g., `git@github.com:alice/repo.git`)
- Environment variable values that contain tokens or identifiers

...then the resulting SHA-256 hash, while not human-readable, is a **deterministic pseudonym** of PII. Under DSGVO Art. 4(1) and Art. 4(5), pseudonymized data is still personal data. The hash binds the PII into an irreversible form, but the process that creates it has processed personal data.

**However**, the `context_fingerprint` serves a legitimate purpose: detecting state changes that invalidate an approval. The question is whether the input to the hash function must include PII-adjacent data.

**Recommendation:**
1. Hash only **content-derived** inputs, not path-derived inputs:
   - ✅ Git tree hash (SHA of file contents, not file paths)
   - ✅ Verification contract hash (SHA of the contract document content)
   - ✅ Risk tier (enum value)
   - ❌ Absolute file paths (use relative-to-project-root paths)
   - ❌ Repository URL (use a normalized slug: `org/repo` instead of full URL with username)
2. If file paths must be included for scope binding, use **project-relative paths only** (e.g., `src/api/routes.js`, not `~/project/src/api/routes.js`).
3. Document the exact hash input specification to allow auditing.

#### DSGVO-02: No Deletion Mechanism for Evidence Files (MEDIUM)

**Finding DSGVO-02 (MEDIUM):** The architecture defines how the kernel generates evidence (gate decisions, approval receipts, audit logs) but does **not** define how these are deleted when a data subject exercises their right to erasure under Art. 17 DSGVO.

The existing `data-retention.json` policy covers **application-level entities** (adopter, donor, volunteer, etc.) but does not cover **operational evidence artifacts** generated by the kernel itself. This is a gap.

**Recommendation:**
1. Define a `kernel_evidence` entity in an updated `data-retention.json`:
   ```json
   {
     "kernel_evidence": {
       "description": "Gate kernel operational evidence (decisions, receipts, audit logs)",
       "retention_years": 1,
       "legal_basis": "Legitimate interest (Art. 6(1)(f) DSGVO) — security auditing",
       "pii_fields": ["repository_url", "scope_paths", "approved_by"],
       "anonymization_required": true,
       "deletion_mechanism": "hard_delete_after_retention",
       "notes": "Must be deletable upon Art. 17 request. Core audit trail retained without PII."
     }
   }
   ```
2. Implement a `kernel-evidence-purge` command that:
   - Anonymizes `repository_url` (replace with normalized org/repo slug)
   - Strips user-specific path prefixes from `scope_paths`
   - Removes `approved_by` human identifier
   - Removes consumed nonce ledger entries
   - Retains classification, gate names, tool gaps, and timestamps (operational security data, no PII)
3. Ensure the purge is **human-gated** (per `agent_policy.all_deletions_require_human: true`).

#### DSGVO-03: No Retention Policy for Kernel Evidence (MEDIUM)

**Finding DSGVO-03 (MEDIUM):** The architecture does not define retention periods for:
- Gate decision JSON files
- Approval receipts (active, consumed, expired)
- Consumed nonce ledger entries
- Audit log entries
- Backup manifests

**Recommendation — retention schedule:**

| Artifact | Retention Period | Rationale | After Retention |
|----------|-----------------|-----------|-----------------|
| Gate decision JSONs | 90 days active + 1 year archive | Security audit trail; incident investigation window | Anonymize and aggregate into statistical summary; delete individual decisions |
| Approval receipts (PENDING/APPROVED) | Until consumed/expired + 90 days | Operational necessity; audit trail | Delete after 90 days post-expiry/consumption |
| Approval receipts (CONSUMED) | 90 days (for replay detection) | Nonce collision protection window | Delete nonce from ledger after 90 days; nonces are 32-byte random — no PII |
| Consumed nonce ledger | 90 days (synchronized with receipts) | Replay attack detection | Rolling deletion — entries older than 90 days are purged |
| Audit logs | 1 year (rolling) | Security incident investigation; Art. 32 accountability | Rotate logs; retain only aggregate statistics (counts per gate, classification distributions) |
| Backup manifests | Duration of backup validity (typically 30 days) | Rollback safety | Delete when backup directory is deleted |

---

### 2.3 Odysseus Integration Data — PII Analysis

**Assessment: PASS**

The Odysseus adapter detects the presence of Odysseus by checking for files and directories. The data it handles:

| Signal | Data Accessed | PII? | Analysis |
|--------|---------------|------|----------|
| `integrations/claude/` | Directory existence | No | Directory name is a fact about software structure |
| `integrations/codex/` | Directory existence | No | Same as above |
| `companion/` | Directory existence | No | Same as above |
| `app.py` | File existence (potentially first 512 bytes for license header) | No | Source code is not PII; license text is not PII |
| `data/skills.json` | File existence | No | Skills are agent configuration, not personal data |
| `data/presets.json` | File existence | No | Presets are agent configuration, not personal data |
| `data/sessions.json` | **MUST NOT READ** | ⚠️ **YES** | Contains session tokens — structural validation must avoid this file |

**Critical design requirement:** The Odysseus detection must **never** check file presence in `data/sessions.json`, `data/memory.json`, or any file in `data/` that is not explicitly documented as a detection signal. The `data/` directory contains runtime state that may include session tokens, memory entries, and user-specific data.

**Recommendation:** The detection logic should use an explicit **whitelist** of allowed signal files:
```javascript
const ALLOWED_SIGNALS = [
  'integrations/claude/',
  'integrations/codex/',
  'companion/',
  'app.py',
  'data/skills.json',
  'data/presets.json',
];
// Any other file in data/ is NOT checked
```

**Data minimization verdict:** ✅ PASS — with the whitelist constraint enforced by kernel gate `NO_UNRELATED_WORKTREE_WRITE` and `NO_PATH_ESCAPE`.

---

### 2.4 Email/Calendar Gate Protection

**Assessment: AMBER_REVIEW — DSGVO-04**

**Finding DSGVO-04 (MEDIUM):** The Odysseus-specific risk table in the research report lists:
- "Email send without approval → HIGH → Scope-gated Approval"
- "Calendar write without approval → MEDIUM → Scope-gated Approval"

The gate model separates **read** from **send/write** for email and calendar — but the architecture as described does **not gate read operations** for email and calendar. This is a DSGVO gap.

Under DSGVO:
- **Reading email** (accessing message content, metadata, sender/recipient addresses) constitutes **processing of personal data** (Art. 4(2)) and requires a legal basis (Art. 6).
- **Reading calendar** (accessing event titles, descriptions, attendees, locations) similarly constitutes processing of personal data.
- The distinction between "read" and "send/write" is relevant for security (sending is higher risk), but DSGVO cares about **all processing**, including read access.

**Current state:** The kernel gates `NO_PRODUCTION_WRITE_WITHOUT_APPROVAL` and `NO_REMOTE_ACTION_WITHOUT_SCOPED_APPROVAL` gate write/send operations only. Read access to email and calendar is not explicitly gated by the kernel.

**Recommendation:**
1. Add a kernel-level gate or policy-level gate for **reading** email and calendar data:
   - `NO_EMAIL_READ_WITHOUT_SCOPE`: Agent must not read email content without explicit, scoped approval.
   - `NO_CALENDAR_READ_WITHOUT_SCOPE`: Agent must not read calendar data without explicit, scoped approval.
2. The approval receipt model should distinguish between `email_read`, `email_send`, `calendar_read`, `calendar_write` as separate action types (per Gate 14: NO_CROSS_ACTION_APPROVAL).
3. Email read approval should be scoped to specific folders/labels and time ranges — not blanket "read all email."
4. Calendar read approval should be scoped to specific calendars and date ranges.

**Mitigation in current design:** The read gates can be added at Layer 2 (Policy Gates) or Layer 3 (Project Gates) without modifying the kernel. However, given that email/calendar content is among the most sensitive personal data categories, a kernel-level gate is recommended.

---

### 2.5 Document/Memory Data Protection

**Assessment: PASS (with observation)**

The Odysseus risk table lists:
- "Memory write without approval → MEDIUM → Approval Receipt"
- "Skill write without approval → MEDIUM → Approval Receipt"

The kernel's data minimization requirements for documents and memory are:

1. **Memory operations are gated:** Gate 14 (NO_CROSS_ACTION_APPROVAL) ensures that `memory_write` approval is distinct from `skill_write` or other action types. Gate 16 (NO_EXPIRED_APPROVAL) ensures time-bounded access.

2. **Separate read/write for memory is not differentiated:** The current approval model has `memory_write` as an action type but does not have `memory_read`. This is partially acceptable because:
   - Agent memory is typically agent-internal state (conversation history, task context)
   - It is not user-visible PII unless the agent has processed PII and stored it in memory
   - However, if memory contains DSGVO-relevant data, read operations should be gated

3. **Document operations are not explicitly gated:** The architecture does not define specific gates for document read/write. The Odysseus risk table mentions "Document/Memory Data" as a concern but does not resolve it with a specific gate.

**Recommendation:**
1. Add `document_read` and `document_write` as approval action types if the kernel is deployed in contexts where agents access user documents.
2. Add a policy-level rule: "Agent must not search or index document contents without explicit scope approval."
3. For the Odysseus adapter specifically: document that the handoff manifest should include a policy restricting document access to explicitly scoped paths.

---

### 2.6 Model Data Transfer (External LLM Providers)

**Assessment: AMBER_REVIEW — requires AVV consideration**

When agents use external LLM providers (Anthropic, OpenAI, Google, etc.), data leaves the local environment. The kernel's role is to **gate** this data transfer.

#### What the kernel currently gates:

The architecture provides indirect protection through:
- **Gate 18 (NO_GLOBAL_RUNTIME_CONFIG_WRITE):** Prevents unauthorized modification of provider configuration, but does not gate the actual data sent to providers.
- **Layer 3 (Project Gates):** `no cloud LLM` gate can block external model usage entirely — but this is a binary on/off, not a data minimization filter.

#### What is NOT gated (gap):

The kernel does not:
1. Inspect or filter the **content** of prompts sent to external LLMs
2. Detect PII in prompts before they are sent
3. Gate based on the **type** of data being transferred (code vs. personal data vs. secrets)
4. Verify that an AVV (Data Processing Agreement per Art. 28 DSGVO) exists with the LLM provider before allowing data transfer

#### DSGVO requirements for model data transfer:

Under DSGVO:
- **Art. 28:** If personal data is processed by an external LLM provider, an AVV is required.
- **Art. 44-49:** Transfer to non-EU providers (US-based LLM APIs) requires adequate safeguards (EU-U.S. Data Privacy Framework certification, Standard Contractual Clauses, etc.).
- **Art. 5(1)(c):** Only the minimum necessary personal data should be sent.
- **Art. 32:** The transfer must be secured (TLS, API key auth).

**Recommendation:**
1. Add a kernel-level or policy-level gate `NO_LLM_TRANSFER_WITHOUT_AVV_CHECK`: Before any prompt is sent to an external LLM, verify that:
   - The provider is on an approved list (configurable)
   - The provider's DPF/SCC status is documented
   - An AVV reference exists (could be a file at `.opencode/avv/<provider>.md`)
2. Add a policy-level secret/PII scanner that checks prompts for known PII patterns before sending.
3. Document the data transfer posture: "This kernel does not inspect prompt content for PII. It is the responsibility of the agent implementation to minimize personal data in prompts. The kernel gates whether prompts may be sent at all, not what they contain."
4. Add `NO_LLM_TRANSFER_WITHOUT_APPROVAL` as a kernel gate in scenarios where the project declares `no cloud LLM` mode.

**Current limitation:** Deep prompt inspection is computationally expensive and prone to false positives. The kernel should focus on **gating the transfer decision** (allowed/blocked) rather than content filtering, which belongs at the agent level with human review.

---

## 3. Specific Checks — Detailed Analysis

### 3.1 No PII in Kernel Gate Evidence

**Overall Assessment: AMBER_REVIEW — DSGVO-05**

**Finding DSGVO-05 (LOW):** The `blocked_by.evidence` field in the gate decision schema includes example content like:

```json
{
  "gate": "NO_FORCE_PUSH",
  "reason": "Command matches git push --force pattern",
  "evidence": "Command string: 'git push --force origin main'"
}
```

While this specific example is safe, the `evidence` field is free-form text. If a command string contains a user-specific path (e.g., `git push --force origin main` from `~/project`), that path could leak into the evidence field.

**Per-gate PII risk assessment:**

| Gate | Evidence field content | PII Risk | Mitigation |
|------|----------------------|----------|------------|
| NO_FORCE_PUSH | Command string | ⚠️ Could contain paths | Redact user paths in evidence before storage |
| NO_SECRET_LEAK | File path (but NOT content) | ⚠️ Could contain paths | Use project-relative paths |
| NO_PATH_ESCAPE | Absolute path that was rejected | ⚠️ Contains path | Log only the violation type, not the full path |
| NO_SYMLINK_ESCAPE | Symlink target path | ⚠️ Contains path | Log only the violation, not the target |
| NO_UNRELATED_WORKTREE_WRITE | Unauthorized path | ⚠️ Contains path | Use project-relative paths |
| NO_PRODUCTION_WRITE_WITHOUT_APPROVAL | Target path/command | ⚠️ Contains path | Redact or use relative paths |
| NO_REMOTE_ACTION_WITHOUT_SCOPED_APPROVAL | Command string | ✅ Usually safe (remote command) | — |
| NO_FALSE_GREEN | Missing evidence type | ✅ Enum name only | — |
| NO_FAKE_EXECUTION | Missing output fields | ✅ Field names only | — |
| NO_REVIEWER_WRITE | File path | ⚠️ Contains path | Use relative paths |
| NO_APPLY_WITHOUT_BACKUP | None (boolean check) | ✅ | — |
| NO_ROLLBACK_WITHOUT_VALIDATED_MANIFEST | Manifest hash | ✅ | — |
| NO_APPROVAL_REUSE | Nonce (already consumed) | ✅ | — |
| NO_CROSS_ACTION_APPROVAL | Action type mismatch | ✅ | — |
| NO_CROSS_SCOPE_APPROVAL | Out-of-scope path | ⚠️ Contains path | Use relative paths |
| NO_EXPIRED_APPROVAL | Expiry timestamp | ✅ | — |
| NO_RUNTIME_ADAPTER_OVERRIDE | Adapter name + violation | ✅ | — |
| NO_GLOBAL_RUNTIME_CONFIG_WRITE | Global config path | ⚠️ Contains ~ path | Anonymize to `~/.opencode/` (generic) |
| NO_AGPL_INCORPORATION | AGPL source path | ⚠️ Could contain user paths | Anonymize to project-relative |

**Recommendation:** Define a evidence redaction function `redactEvidence(raw)` that:
1. Replaces absolute paths with project-relative equivalents
2. Strips home directory prefixes (`~/*/` → `~/`)
3. Redacts environment variable values (only keys remain)
4. Replaces repository URLs with `org/repo` slugs
5. Is called **before** the gate decision JSON is written to disk

---

### 3.2 No Real Credential Data in Reports

**Assessment: PASS**

Gate 2 (NO_SECRET_LEAK) explicitly prevents secret leakage into files. The gate:
- Blocks writes to `*.env*`, `*secret*`, `*credential*`, `*token*` files
- Scans content for patterns like `sk-*`, `ghp_*`, `xoxb-*`, JWT tokens, private keys
- Logs the path (but NOT the content) of a violation

This gate is in **Layer 1 (Kernel Gates)** and cannot be weakened. It provides structural protection against credential leakage into evidence files.

**Additional safe-guard:** The `{env:VARIABLE}` substitution pattern used in `opencode.jsonc` ensures that even if configuration files are copied into reports, real token values are not embedded.

**Recommendation:** Include a pre-commit / pre-push hook (as a script, not enforced by the kernel since the kernel is project-local) that scans all report files for credential patterns. This hook can invoke the same secret detection logic from `kernel.mjs`.

---

### 3.3 No Actual Email/Calendar/Document Content in Structural Validation

**Assessment: PASS (by design)**

The structural validation performed by the kernel:
- Checks file presence (not content) for detection signals
- Inspects command strings for pattern matching
- Validates file paths against scopes
- Hashes repository state

None of these operations read email bodies, calendar event details, or document contents. The kernel operates at the **filesystem metadata + command string + policy** level, not the application content level.

**However**, if the kernel is extended with a secret/PII scanner that reads file contents (as recommended for model data transfer above), that scanner must be **scoped to not read** email storage files, calendar databases, or document directories by default. The scanner should be configurable with exclusion paths.

**Recommendation:** Add a kernel-level exclusion list for PII scanning: `~/.local/share/mail/`, `~/.local/share/calendar/`, `~/.local/share/evolution/`, `~/Documents/` — paths that commonly contain personal email, calendar, and document data should be excluded from automatic content scanning.

---

### 3.4 No User-Specific Paths in Generated Artifacts

**Assessment: AMBER_REVIEW — requires path redaction**

As analyzed in DSGVO-01 and DSGVO-05, several kernel artifacts could contain user-specific paths:
- Gate decision `evidence` fields
- Approval receipt `scope_paths` 
- Approval receipt `repository` URL
- Audit log entries
- Backup manifest paths

**Existing precedent:** The prior compliance review (runtime-hardening-compliance-review.md) identified PII-01 and PII-02 — absolute user paths and GitHub usernames in generated reports. The same pattern could recur in kernel-generated artifacts.

**Recommendation — mandatory path handling rules:**
1. All file paths stored in kernel artifacts must be **project-relative** whenever possible.
2. When absolute paths are unavoidable (e.g., for path-escape detection evidence), the home directory portion must be replaced with `~/` and the username stripped.
3. Repository URLs must be normalized to `org/repo` slugs; the full `git@github.com:user/repo.git` URL must not be stored in evidence unless the user is explicitly identified in the URL.
4. These rules must be enforced by a `sanitizePath()` function in `kernel.mjs` that is called on every path before it is written to any evidence artifact.

---

### 3.5 Audit Logs Must Be Deletable per DSGVO Art. 17

**Assessment: AMBER_REVIEW — DSGVO-02, DSGVO-03 overlap**

This is addressed in DSGVO-02 and DSGVO-03 above. The architecture does not currently define a deletion mechanism.

**Additional consideration:** Under Art. 17(3), the right to erasure does not apply to the extent that processing is necessary "for the establishment, exercise or defence of legal claims." Audit logs used for security incident investigation may qualify for this exception. However, this exception:
1. Does not apply to **all** audit data — only data directly relevant to pending or foreseeable legal claims.
2. Requires a documented legal basis for retention.
3. Does not exempt from the obligation to inform the data subject (Art. 15 — right of access).

**Recommendation:** Implement tiered audit log retention:
- **Tier 1 (Operational):** Gate decisions, tool gaps, capabilities — deletable after 90 days.
- **Tier 2 (Security):** Blocked operations, approval violations, path escapes — deletable after 1 year.
- **Tier 3 (Legal hold):** Evidence relevant to an active security incident or legal proceeding — retained until hold is lifted.

---

### 3.6 `context_fingerprint` Must Not Capture PII

**Assessment: FAIL — DSGVO-01**

Addressed in DSGVO-01 above. This is the most significant finding.

**Specific fix required:** The SHA-256 input for `context_fingerprint` must be constructed from:
```javascript
const fingerprintInput = [
  gitTreeHash,                          // SHA of file contents (not paths)
  riskTier,                             // Enum string
  verificationContractHash,             // SHA of contract document content
  scopePaths.map(p => relativePath(p)), // Project-relative only
  branch,                               // Branch name (usually safe)
  action,                               // Action type (enum)
].join(':');

const contextFingerprint = sha256(fingerprintInput);
```

Explicitly **excluded** from the fingerprint input:
- Absolute file paths
- Repository full URL (use normalized slug if needed)
- Home directory paths
- Environment variables
- User identifiers
- Machine hostnames

---

## 4. Consent Model Assessment

### Does the Approval Receipt Model Satisfy DSGVO Consent Requirements?

**Assessment: PARTIAL — applicable for operational approval, NOT for data subject consent**

The approval receipt model defined in ADR-003 is a **technical authorization mechanism** for gating agent actions. It is NOT a consent mechanism under DSGVO Art. 7. These serve different purposes:

| Aspect | Approval Receipt (ADR-003) | DSGVO Consent (Art. 7) |
|--------|---------------------------|------------------------|
| **Purpose** | Authorize an agent action (push, commit, deploy) | Authorize processing of personal data |
| **Granularity** | Per action type × scope × runtime × branch | Per purpose (marketing ≠ analytics ≠ medical) |
| **Withdrawal** | Expires automatically (TTL) + single-use | Must be as easy as giving; can be withdrawn at any time |
| **Informed** | User sees action + scope + runtime | Data subject must understand what data is processed, by whom, for what purpose, for how long |
| **Record-keeping** | Receipt with nonce + fingerprint + timestamps | Must be demonstrable — consent records must exist |
| **Bundling** | Separate receipts per action type (by design) | Consent must not be bundled — freely given |
| **Scope** | Technical operation scope (files, repos) | Data processing scope (data categories, purposes, recipients) |
| **Expiry** | Configurable TTL (4h / 24h) | No mandated expiry; consent is valid until withdrawn |

#### Where the approval model aligns with DSGVO principles:

1. **Granularity (Art. 7(2)):** The approval model is granular — each action type requires a separate receipt. A `push` approval does not authorize a `merge`. This aligns with DSGVO's requirement that consent for different processing purposes must be separable.

2. **Scope-binding:** Each receipt is bound to specific files, paths, and contexts. Changing any dimension invalidates the receipt. This aligns with purpose limitation (Art. 5(1)(b)).

3. **Non-transferable:** The nonce system ensures one-time use. This aligns with the principle that consent is specific to a particular processing operation.

4. **Expiry:** Approvals expire based on TTL. This aligns with storage limitation (Art. 5(1)(e)).

5. **Auditability:** Every approval is recorded with timestamps, scope, and context. This supports accountability (Art. 5(2)).

#### Where the approval model does NOT satisfy DSGVO consent:

1. **It's not about personal data:** The approval model gates agent *actions* (file writes, git operations), not the processing of *personal data*. A DSGVO consent mechanism would need to be built on top of the approval model, extending it with data processing purposes.

2. **No data subject awareness:** The approval model is designed for the *developer/operator* who approves agent actions. It does not address the *data subject* whose personal data might be processed as a result of those actions.

3. **No withdrawal mechanism for data subjects:** While approvals expire and are single-use (operationally), there is no mechanism for a data subject to withdraw their consent for data processing. This would need to be a separate layer.

**Recommendation for consent integration:**

If the kernel is deployed in a context where agents process personal data (e.g., CiviPet with adopter/donor records), the approval receipt model should be extended with:

```json
{
  "consent_context": {
    "data_subject_id": "optional — for per-subject consent",
    "processing_purpose": "adoption_matching | donation_receipt | veterinary_notification",
    "data_categories": ["contact", "financial", "medical"],
    "legal_basis": "consent | legitimate_interest | legal_obligation",
    "consent_record_ref": "reference to DSGVO consent record (external system)",
    "withdrawal_mechanism": "how the data subject can withdraw (URL, email, UI path)"
  }
}
```

This extension would be a **policy-level addition** (Layer 2), not a kernel modification.

---

## 5. Data Minimization Recommendations

### Concrete Rules

Based on the analysis above, the kernel MUST enforce the following data minimization rules:

#### Rule DM-1: Path Redaction Before Storage
All file paths in evidence artifacts must be redacted:
- Convert absolute paths to project-relative paths
- Strip home directory usernames (replace with `~/`)
- Strip machine-specific prefixes (`/media/`, `/mnt/`, `/Volumes/`)

#### Rule DM-2: Repository URL Normalization
Repository URLs must be stored as `org/repo` slugs, not full `git@github.com:user/repo.git` URLs, unless the URL is needed for operational correctness (e.g., git remote operations).

#### Rule DM-3: Evidence Field Minimization
The `blocked_by.evidence` field must contain the **minimum information** necessary to explain the gate decision:
- Gate name + violation type (always)
- Classification (always)
- Timestamp (always)
- Specific details (only when needed for debugging — and redacted per DM-1)

#### Rule DM-4: PII Exclusion from Hashes
Cryptographic hashes (`context_fingerprint`, backup manifest hashes) must not include PII in their input. Use content-derived inputs only (git tree hash, document content hash, normalized identifiers).

#### Rule DM-5: Detection Signal Whitelist
Runtime detection must only check explicitly whitelisted signal files. No recursive directory scanning. No reading of files not on the whitelist.

#### Rule DM-6: Structural Validation Only
All kernel operations are structural (file presence, path validation, pattern matching, hash comparison). The kernel must not read application content (email bodies, calendar events, document contents, database records, memory files, session files).

#### Rule DM-7: No Retention of Raw Operation Data
After a gate decision is made, the raw operation descriptor (which may contain unchecked user input including paths and commands) must not be retained beyond the decision lifecycle. Only the redacted decision JSON and approval receipt are stored.

---

## 6. Retention Policy Recommendations

### Per Data Type

| Data Type | Retention Period | Legal Basis | Deletion Mechanism | PII Removal |
|-----------|-----------------|-------------|-------------------|-------------|
| **Gate decision JSONs** | 90 days active + 1 year archive | Art. 6(1)(f) — security auditing | `hard_delete` after archive period; aggregate statistics retained | Yes — paths redacted per DM-1 |
| **Approval receipts (active)** | Until consumed/expired | Operational necessity | Transition to CONSUMED/EXPIRED state | No — operational data needed during validity |
| **Approval receipts (consumed/expired)** | 90 days after state transition | Art. 6(1)(f) — nonce replay protection | `hard_delete` after 90 days | Yes — `approved_by` field anonymized |
| **Consumed nonce ledger** | 90 days | Art. 6(1)(f) — replay attack detection | Rolling deletion of entries older than 90 days | N/A — cryptographically random nonces contain no PII |
| **Audit logs** | 1 year rolling | Art. 6(1)(f) + Art. 32 accountability | Log rotation; aggregate statistics retained indefinitely | Yes — paths redacted; only gate names, classifications, timestamps retained in aggregates |
| **Backup manifests** | Duration of backup validity (30 days) | Operational necessity (rollback safety) | Delete when backup directory is deleted | N/A — contains file hashes, not content |
| **Handoff manifests** | Until imported by target runtime | Operational necessity | Delete after confirmed import | Yes — no PII by design (structured data only) |
| **Tool gap reports** | 90 days | Art. 6(1)(f) — environment auditing | `hard_delete` after 90 days | N/A — enum values only, no PII |

### Automated Cleanup

Add a `kernel-evidence-purge` job to `data-retention.json`:

```json
{
  "kernel_evidence_cleanup": {
    "jobs": [
      {
        "target": "gate_decisions",
        "action": "anonymize_paths_then_hard_delete",
        "condition": "decision_timestamp < NOW() - INTERVAL '90 days'",
        "schedule": "weekly"
      },
      {
        "target": "consumed_approval_receipts",
        "action": "hard_delete",
        "condition": "consumed_at < NOW() - INTERVAL '90 days'",
        "schedule": "weekly"
      },
      {
        "target": "consumed_nonces",
        "action": "hard_delete",
        "condition": "consumed_at < NOW() - INTERVAL '90 days'",
        "schedule": "weekly"
      },
      {
        "target": "audit_logs",
        "action": "rotate_and_aggregate",
        "condition": "entry_timestamp < NOW() - INTERVAL '1 year'",
        "schedule": "monthly"
      }
    ]
  }
}
```

---

## 7. Compliance Gate Requirements

### What the Kernel MUST Enforce (Compliance Baseline)

The following gates must be present and immutable (Layer 1: Kernel Gates):

| Gate | DSGVO Article | Requirement |
|------|---------------|-------------|
| NO_SECRET_LEAK (Gate 2) | Art. 32 | Security of processing — prevent credential exposure |
| NO_PATH_ESCAPE (Gate 3) | Art. 32 | Security of processing — prevent unauthorized file access |
| NO_SYMLINK_ESCAPE (Gate 4) | Art. 32 | Security of processing — prevent symlink-based path traversal |
| NO_PRODUCTION_WRITE_WITHOUT_APPROVAL (Gate 6) | Art. 5(1)(f), Art. 32 | Integrity/confidentiality — prevent unauthorized production data modification |
| NO_UNRELATED_WORKTREE_WRITE (Gate 5) | Art. 5(1)(c) | Data minimization — prevent scope creep |
| NO_FALSE_GREEN (Gate 8) | Art. 5(2) | Accountability — prevent unverified compliance claims |
| NO_FAKE_EXECUTION (Gate 9) | Art. 5(2) | Accountability — prevent fabricated evidence |
| NO_AGPL_INCORPORATION (Gate 19) | License compliance | Prevent AGPL contamination |

The following gates should be added at Layer 2 (Policy Gates) or considered for Layer 1:

| Proposed Gate | DSGVO Article | Requirement |
|---------------|---------------|-------------|
| NO_PII_IN_EVIDENCE (NEW) | Art. 5(1)(c) | Data minimization — prevent PII leakage in gate evidence |
| NO_EMAIL_READ_WITHOUT_SCOPE (NEW) | Art. 5(1)(c), Art. 6 | Lawful processing — gate email read access |
| NO_CALENDAR_READ_WITHOUT_SCOPE (NEW) | Art. 5(1)(c), Art. 6 | Lawful processing — gate calendar read access |
| NO_LLM_TRANSFER_WITHOUT_AVV_CHECK (NEW) | Art. 28, Art. 44-49 | Data processing agreements + international transfers |

---

## 8. Open Questions — Requiring Legal Review Beyond This Agent's Scope

The following questions require review by a qualified legal professional (Fachanwalt für IT-Recht / Datenschutzrecht). This compliance agent can assess architectural alignment with DSGVO principles but cannot make definitive legal determinations.

### Q1: AGPL Boundary — `app.py` Header Reading
**Context:** The proposed detection reads the first 512 bytes of `app.py` for license header detection.
**Legal question:** Does reading 512 bytes of an AGPL-licensed file into process memory for license identification constitute "copying" under AGPL-3.0 Section 5? Does the transient nature of the read (immediate discard after pattern match) qualify as an exception under § 44a UrhG (temporary acts of reproduction)?

### Q2: AGPL Boundary — Architecture Facts in Adapter Code
**Context:** The Odysseus adapter's `plan()` method encodes knowledge about Odysseus's architecture (directory structure, file formats, default behavior).
**Legal question:** At what point does documenting "facts about a program" cross into "creating a derivative work" under AGPL-3.0? Is there a relevant precedent under German/EU copyright law (§ 69a UrhG) that distinguishes ideas/principles from expression in this context?

### Q3: Approval Receipts as Consent Records
**Context:** The approval receipt model gates agent actions. In a CiviPet deployment, these actions might process personal data (adopter records, donor data).
**Legal question:** Can an approval receipt double as a DSGVO Art. 7 consent record if extended with processing purpose, data categories, and legal basis? Or must consent records be maintained in a separate, legally-mandated format?

### Q4: External LLM Provider AVV Requirements
**Context:** The kernel does not currently gate data transfer to external LLM providers.
**Legal question:** If an agent sends prompts containing only code (no personal data) to an external LLM API, is an AVV (Art. 28) required? At what point does a "prompt" cross into "personal data" territory (e.g., code comments mentioning individuals, file paths containing usernames)?

### Q5: `context_fingerprint` as Pseudonymized Data
**Context:** DSGVO-01 identifies that `context_fingerprint` (SHA-256 of state) could constitute pseudonymized personal data if the hash input includes PII-adjacent data.
**Legal question:** Under DSGVO, is a SHA-256 hash of a data set that includes personal data itself considered personal data? The hash is deterministic pseudonymization — the original data cannot be recovered from the hash alone, but the hash can be linked to the data subject if the original input is known. Does this meet the threshold for "personal data" under Art. 4(1) as interpreted by the ECJ?

### Q6: Audit Log Deletion vs. Legal Hold
**Context:** DSGVO-02 proposes tiered retention with a legal hold exception for security incidents.
**Legal question:** Can the "establishment, exercise or defence of legal claims" exception (Art. 17(3)(e)) be applied proactively to all security audit logs, or must there be a specific, pending legal claim to justify retention? What documentation is required to justify the exception?

### Q7: Ecosystem License Declaration
**Context:** The ecosystem has no LICENSE file. AGPL-01 identifies this as a blocker for the Odysseus adapter.
**Legal question:** If the ecosystem remains unlicensed ("all rights reserved"), does the handoff-only approach to Odysseus still avoid AGPL copyleft? Or does the absence of a permissive license make the AGPL boundary analysis more conservative (i.e., any interaction with AGPL code is riskier because there is no open-source safe harbor)?

---

## 9. Recommendations Summary — Priority-Ordered

### Before Implementation Can Proceed

| Priority | ID | Action |
|----------|-----|--------|
| **P0** | AGPL-01 | Add a LICENSE file to the ecosystem (recommend MIT or Apache-2.0) |
| **P0** | DSGVO-01 | Define `context_fingerprint` hash input specification excluding PII |
| **P1** | DSGVO-02 | Define kernel evidence deletion mechanism + `kernel-evidence-purge` command |
| **P1** | DSGVO-03 | Define retention periods for all kernel evidence artifact types |
| **P1** | DSGVO-05 | Implement `sanitizePath()` + `redactEvidence()` before storage |
| **P2** | AGPL-02 | Remove or harden `app.py` header reading; prefer directory-structure-only detection |
| **P2** | DSGVO-04 | Add email/calendar read gates (at minimum at Layer 2 Policy level) |
| **P3** | AGPL-03 | Add AGPL boundary comment header to `adapter-odysseus.mjs`; flag for legal review |

### Design Improvements (Non-Blocking)

| ID | Improvement |
|----|-------------|
| IMP-01 | Add `NO_PII_IN_EVIDENCE` kernel gate (DM-1 through DM-7 enforcement) |
| IMP-02 | Add `NO_LLM_TRANSFER_WITHOUT_AVV_CHECK` policy gate |
| IMP-03 | Extend approval receipt schema with optional `consent_context` for DSGVO consent records |
| IMP-04 | Add `kernel-evidence-purge` to `data-retention.json` automated cleanup jobs |
| IMP-05 | Whitelist Odysseus detection signals (exclude `data/sessions.json`, `data/memory.json`) |
| IMP-06 | Add tiered audit log retention (operational/security/legal-hold) |

---

## 10. Compliance Status

| Category | Verdict | Details |
|----------|---------|---------|
| AGPL License Boundary — Handoff approach | ✅ **PASS** | Arm's length via JSON manifests; no code incorporation |
| AGPL License Boundary — Detection signals | ✅ **PASS** (with AGPL-02) | File presence checks are safe; header reading needs hardening |
| AGPL License Boundary — Adapter methods | ✅ **PASS** (with AGPL-03) | Facts about architecture are not copyrighted expression; legal review recommended |
| AGPL License Boundary — Ecosystem license | ❌ **BLOCKED** (AGPL-01) | No LICENSE file — must be resolved before Odysseus adapter ships |
| DSGVO — Data minimization (Art. 5(1)(c)) | ⚠️ **AMBER** | DSGVO-01, DSGVO-05 — path/PII redaction needed |
| DSGVO — Purpose limitation (Art. 5(1)(b)) | ✅ **PASS** | Gate model enforces per-action, per-scope authorization |
| DSGVO — Storage limitation (Art. 5(1)(e)) | ⚠️ **AMBER** | DSGVO-03 — retention periods not defined |
| DSGVO — Right to erasure (Art. 17) | ⚠️ **AMBER** | DSGVO-02 — no deletion mechanism defined |
| DSGVO — Security of processing (Art. 32) | ✅ **PASS** | 19 kernel gates provide strong technical measures |
| DSGVO — Data protection by design (Art. 25) | ✅ **PASS** | Default-deny, scope-bound, evidence-gated architecture |
| DSGVO — Accountability (Art. 5(2)) | ✅ **PASS** | Machine-readable, auditable gate decisions + approval receipts |
| DSGVO — Consent mechanism (Art. 7) | ⚠️ **N/A** | Approval model is technical authorization, not DSGVO consent — extension needed for data processing contexts |
| DSGVO — Email/Calendar protection | ⚠️ **AMBER** (DSGVO-04) | Write operations gated; read operations need gating |
| DSGVO — Model data transfer (Art. 28, 44-49) | ⚠️ **AMBER** | No LLM transfer gate; AVV check recommended |

### Overall Classification: `AMBER_REVIEW`

The architecture is fundamentally sound and demonstrates strong DSGVO alignment in its design principles. The 19 kernel gates provide a robust security baseline that satisfies Art. 32 requirements. The approval receipt model, while a technical authorization mechanism rather than a consent mechanism, aligns with DSGVO principles of granularity, purpose limitation, and accountability.

**The architecture can proceed to implementation** after the two P0 blockers (AGPL-01, DSGVO-01) are resolved and the four P1 findings (DSGVO-02 through DSGVO-05) have documented remediation plans. The P2 and P3 findings should be addressed during implementation but are not blockers.

---

## Quellen / Sources Reviewed

### Architecture Documents
- `docs/architecture/runtime-neutral-gate-kernel.md` (ADR-003, 920 lines)
- `docs/adr/ADR-universal-project-bootstrap.md`
- `WORKING-METHOD.md` (Canonical 24-step workflow)

### Research Reports
- `docs/reports/odysseus-integration-research.md` (Odysseus AGPL-3.0 analysis)
- `docs/reports/runtime-gate-kernel-research.md` (OpenCode/Hermes capabilities)
- `docs/reports/runtime-hardening-compliance-review.md` (prior compliance review with PII findings)
- `docs/reports/runtime-hardening-security-review.md`
- `docs/reports/compliance-review.md`
- `docs/reports/security-review.md`

### Policy Files
- `.opencode/policies/data-retention.json` (DSGVO retention rules)
- `.opencode/policies/evidence-gates.json` (evidence requirements per claim type)
- `.opencode/policies/write-protection.json` (write protection rules)
- `.opencode/policies/mcp-trust-tiers.json` (MCP trust tier classification)

### External References
- AGPL-3.0 License: https://www.gnu.org/licenses/agpl-3.0.html
- DSGVO (GDPR): Regulation (EU) 2016/679
- EU-U.S. Data Privacy Framework: https://www.dataprivacyframework.gov/

---

## Annahmen / Unsicherheiten

1. The ecosystem will be licensed under MIT or Apache-2.0 before the Odysseus adapter ships. If it remains unlicensed, the AGPL boundary analysis must be revisited with a more conservative interpretation.
2. The `data/sessions.json` file in the Odysseus runtime does not contain personal data beyond session tokens. This assumption should be verified by a security review of the actual Odysseus runtime data formats.
3. The legal analysis of AGPL boundary is based on widely-accepted open-source licensing principles (FSF guidance, OSI interpretations, EU Copyright Directive). Specific case law on AGPL-3.0 boundaries in the context of "detection vs. incorporation" is limited. A formal legal opinion is recommended.
4. The DSGVO analysis assumes the kernel operates in a German/EU jurisdiction. If deployed in non-EU contexts with different data protection laws, additional analysis may be required.
5. The `context_fingerprint` analysis assumes SHA-256 is used as specified. If the hash algorithm changes, the pseudonymization analysis must be revisited.

---

*Review performed by Compliance Agent. All findings are non-destructive. No canonical data was modified. This is a read-only compliance assessment. Human approval required for any remediation actions. Legal questions (Q1–Q7) require qualified legal review beyond this agent's scope.*
