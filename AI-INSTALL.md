# AI-INSTALL.md — Canonical Agent Governance Install Contract

## What This Repository Contains

This repository provides **Canonical Agent Governance** — a universal, runtime-neutral gate evaluation system for AI coding agents (OpenCode, Hermes, Odysseus, and generic runtimes).

It enforces 19 immutable **kernel gates** that prevent dangerous operations across all AI agent runtimes:
force-push, secret leaks, path/symlink escapes, production writes without approval, fake execution claims, reviewer write operations, approval reuse, cross-scope bypasses, and more.

The governance is installed as a local `.agent-governance/` directory inside any target project. It does **not** require global install, root access, or system-wide configuration changes.

## How To Install Governance

### 1. Clone This Repository

```bash
git clone https://github.com/xxammaxx/OpenCode-Agenten-Oekosystem /tmp/OpenCode-Agenten-Oekosystem
```

### 2. Run Dry-Run First (Mandatory)

```bash
node /tmp/OpenCode-Agenten-Oekosystem/scripts/install-governance.mjs --target /path/to/your-project
```

The dry-run **never** modifies files. It shows:
- Which runtimes are detected (OpenCode, Hermes, etc.)
- Risk tier assessment
- Enforcement level reachable
- Files that would be created/modified
- Conflicts or existing installations
- Planned backup path and rollback command
- Final classification (GREEN_SAFE, AMBER_REVIEW, RED_BLOCK)

### 3. Review The Output

Inspect the dry-run output **before** applying. The classification tells you:
- **GREEN_SAFE**: Safe to apply — no conflicts, all signals clean.
- **AMBER_REVIEW**: Review conflicts or weak detection before applying.
- **RED_BLOCK**: Cannot proceed — source or target has blocking issues.
- **TOOL_GAP**: Missing tooling prevents full verification.

### 4. Apply

```bash
node /tmp/OpenCode-Agenten-Oekosystem/scripts/install-governance.mjs \
  --target /path/to/your-project \
  --apply \
  --approval-file /path/to/receipt.json
```

The `--apply` flag:
1. Re-runs all preflight checks
2. Validates the approval receipt (if provided)
3. Verifies source fingerprint hasn't changed
4. Creates a full backup before any writes
5. Copies runtime gate libraries to `.agent-governance/runtime/`
6. Copies governance policies to `.agent-governance/policies/`
7. Generates cryptographically hashed `source-lock.json`
8. Generates `manifest.json` with enforcement level
9. Creates `bin/evaluate.mjs` wrapper for standalone evaluation
10. Installs OpenCode pre-evaluate hook (if OpenCode detected)
11. Installs Hermes governance plugin (if Hermes detected)
12. Runs post-apply validation
13. Generates install report with rollback command

### 5. Rollback (If Needed)

```bash
node /tmp/OpenCode-Agenten-Oekosystem/scripts/install-governance.mjs \
  --target /path/to/your-project \
  --rollback /path/to/backup-dir
```

Rollback restores all files from backup and removes the `.agent-governance/` directory.

## What The AI Should Do When Given This URL

When an AI agent receives `https://github.com/xxammaxx/OpenCode-Agenten-Oekosystem`:

1. **Read** `AI-INSTALL.md` (this file)
2. **Read** `governance-install.json` for machine-readable install metadata
3. **Clone** the repository to a temporary directory
4. **Run dry-run** against the target project
5. **Present classification** to the human user
6. **Wait for approval** before applying
7. **Apply** with `--apply` flag only after explicit human approval
8. **Provide rollback instructions** as part of the completion report

## Dry-Run First Policy

- **ALWAYS** run dry-run before apply.
- Dry-run is the **default mode** — it changes no files.
- Classification of `RED_BLOCK` means **do not proceed**.
- Classification of `AMBER_REVIEW` means **review conflicts and decide**.
- Classification of `GREEN_SAFE` means **safe to apply with human approval**.

## Approval Requirements

For `--apply`, an approval receipt JSON file is recommended:

```json
{
  "version": "1.0.0",
  "action": "apply",
  "runtime": "opencode",
  "scope": {
    "repository": "my-project",
    "branch": "main",
    "commit": "<SHA>",
    "paths": [".agent-governance/"]
  },
  "riskTier": "MEDIUM_REVIEW",
  "status": "APPROVED",
  "approvedBy": "human-operator",
  "approvedAt": "2026-01-01T00:00:00.000Z",
  "expiresAt": "2026-01-01T01:00:00.000Z",
  "singleUse": true,
  "nonce": "<UUID>",
  "contextFingerprint": "<SHA-256>"
}
```

Approval receipts are:
- Single-use (nonce prevents replay)
- Scope-bound (branch, runtime, action locked)
- Time-limited (expires after 1 hour max)
- Fingerprinted (context change invalidates receipt)

## Rollback Procedure

1. Locate the backup directory (printed during apply, stored in install report)
2. Run the rollback command with that directory
3. Verify the `.agent-governance/` directory is removed
4. Verify target project matches pre-install state

## Installed Structure

After apply, the target project will contain:

```
.agent-governance/
├── manifest.json              # Install manifest (version, runtimes, enforcement)
├── source-lock.json            # SHA-256 hashes of all runtime files
├── runtime/
│   ├── evaluate-all.mjs        # Canonical gate evaluation entry point
│   ├── kernel.mjs              # 19 immutable kernel gates
│   ├── policy.mjs              # Policy gate evaluator (comment policy)
│   ├── decision.mjs            # Gate decision contract
│   ├── approval.mjs            # Approval receipt model
│   ├── evidence.mjs            # Evidence validation
│   ├── classifications.mjs     # Classification system
│   ├── errors.mjs              # Gate kernel error types
│   ├── context-fingerprint.mjs # Non-PII context fingerprinting
│   ├── contract.mjs            # Runtime adapter contract
│   ├── generic.mjs             # Generic runtime adapter
│   ├── opencode.mjs            # OpenCode runtime adapter
│   ├── hermes.mjs              # Hermes runtime adapter
│   └── odysseus.mjs            # Odysseus runtime adapter
├── policies/
│   ├── evidence-gates.json
│   ├── mcp-trust-tiers.json
│   ├── write-protection.json
│   ├── data-retention.json
│   └── model-routing.json
├── bin/
│   └── evaluate.mjs            # Standalone CLI wrapper for gate evaluation
└── hooks/
    └── opencode/
        ├── README.md
        └── pre-evaluate.mjs    # OpenCode pre-action hook
```

## Integration With Existing Projects

- **Existing `.agent-governance/`**: If governance is already installed, the installer checks the existing `source-lock.json` for fingerprint match. If the source repository hasn't changed, re-install is idempotent.
- **Existing OpenCode config**: OpenCode hooks are installed alongside existing config — no overwrite.
- **Existing Hermes config**: Hermes governance plugin is installed under `.hermes/governance/` — no overwrite.
- **No global state**: All governance files are project-local. No `~/.config`, `/etc`, or global path changes.

## Security Model

- **Fail-closed**: Any step failure during apply disables further writes.
- **Backup always**: Every apply creates a timestamped backup before writes.
- **Fingerprint verification**: Source commit is locked before copy.
- **Approval receipts**: Single-use, time-limited, scope-bound.
- **Path safety**: No symlink escapes, no path traversal, no `.env` write.
- **Secrets safety**: No secrets in reports, no `.env` files touched.

## Requirements

- **Node.js**: >= 20 (ES module support)
- **Git**: For commit SHA locking
- **Write access**: To target project directory (no root/sudo)
- **No network**: Does not require network access during install

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | GREEN_SAFE — operation safe |
| 1 | AMBER_REVIEW or TOOL_GAP — review required or tooling missing |
| 2 | RED_BLOCK — operation blocked, do not proceed |
