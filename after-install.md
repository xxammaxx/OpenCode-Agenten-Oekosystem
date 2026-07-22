# Canonical Agent Governance — After Install

The Hermes plugin `canonical-agent-governance` is now installed (default
location: `~/.hermes/plugins/`).

## What Is Active Now

- **`pre_tool_call` hook** — every tool call is checked before execution:
  - Write/external tools are **blocked** until governance is installed in
    the active project (`.agent-governance/manifest.json`).
  - Runtime tamper detection via `source-lock.json` hash verification.
  - Kernel gates: force push, `rm -rf`, `DROP TABLE`, path escape.
- **Slash commands:**
  - `/governance-install` — install governance into the current project
  - `/governance-status` — show enforcement status
  - `/governance-doctor` — diagnose the installation
  - `/governance-rollback` — restore the previous state from backup

## Next Steps

1. Change into your target project:

   ```bash
   cd /path/to/your/project
   ```

2. Run a dry-run install first (dry-run is always the default):

   ```
   /governance-install
   ```

   Review the printed plan. Nothing is written during dry-run.

3. Apply only after reviewing the plan (explicit apply required).

4. Verify enforcement:

   ```
   /governance-status
   /governance-doctor
   ```

## Requirements

- **Node.js >= 18** on PATH — the canonical gate evaluator
  (`scripts/evaluate-gates.mjs` → `scripts/lib/gates/evaluate-all.mjs`)
  runs on Node. Without Node, evaluation reports `TOOL_GAP` and
  write/external operations stay blocked (never an implicit allow).
- Project-local plugins additionally require
  `HERMES_ENABLE_PROJECT_PLUGINS=1`.

## Safety Model

- Dry-run first, explicit apply, backups before writes, rollback always
  available from the backup manifest.
- Hooks block via explicit return values; evaluator failures fail
  closed (`TOOL_GAP` blocks writes).
- No secrets are read, written, or logged by this plugin.

## Rollback / Uninstall

- Project rollback: `/governance-rollback` (uses the recorded backup).
- Plugin removal: `hermes plugins remove canonical-agent-governance`.

## Documentation

- `WORKING-METHOD.md` — canonical 22-step execution order
- `BOOTSTRAP.md` — bootstrap flow and safety model
- `SECURITY.md` — security policy
- `.opencode/policies/` — evidence gates, write protection, MCP trust tiers
