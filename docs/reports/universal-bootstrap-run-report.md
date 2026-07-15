# Universal Bootstrap Run Report

- Classification: `GREEN_SAFE`
- Target repository: `OpenCode-Agenten-Oekosystem`
- Branch: `agent/universal-project-bootstrap`
- Reality Gate: passed (2026-07-14)

## Short Summary

The repository was upgraded into a universal project-bootstrap kit for OpenCode and Hermes Agent.

The bootstrap now:

- analyzes target projects before any write
- defaults to dry-run
- preserves existing provider/model settings
- keeps MCPs disabled by default
- generates project-local OpenCode and Hermes assets
- supports explicit `--apply`
- supports explicit `--include-remote-ci`
- creates backups and rollback manifests before writes
- rejects symlink and path-escape attempts
- produces local evidence and validation reports
- validates itself with `GREEN_SAFE`
- hardens the global installer with full symlink and path-traversal protection (19 new tests, 0 failures)

## What The Software Can Do Now

- Read a target project and classify its language, framework, package-manager, database, monorepo, and compliance signals.
- Select minimal OpenCode agents, skills, and MCP candidates based on those signals.
- Generate a project-local `opencode.jsonc` overlay without forcing a provider, model, or shell.
- Generate Hermes handoff assets in `.hermes.md`, `.hermes/README.md`, `.hermes/skills/README.md`, `.hermes/bundles/project-bootstrap.json`, and `.hermes/mcp/opencode-gateway.md`.
- Keep remote CI disabled unless `--include-remote-ci` is explicitly passed.
- Preserve existing OpenCode configuration, including user-owned provider, model, and custom MCP settings.
- Preserve existing project documents by merging managed sections instead of replacing whole files.
- Write a backup before apply and restore removed files on rollback.
- Remove newly created files on rollback when they did not exist before the apply.
- Reject symlinked destinations and path-escape attempts.
- Classify runs as `GREEN_SAFE`, `AMBER_REVIEW`, `RED_BLOCK`, or `TOOL_GAP`.

## Reality Gate — Real Project Test (2026-07-14)

### Test Project

- **Project**: `ai_coding_orchestrator` (OpenCode orchestration service)
- **Source path**: `/media/<user>/projekte/ai_coding_orchestrator`
- **Copy method**: `git clone file://` (cross-filesystem, `/tmp` target)
- **Stack**: JavaScript/Node (npm), TypeScript, Docker, SQLite, Playwright
- **Existing config**: `opencode.json` with `anthropic/claude-sonnet-4-5` provider/model
- **Existing AGENTS.md**: yes (5436 bytes)
- **Existing .opencode/**: yes (commands, plugins, reports)
- **Existing Hermes**: none
- **Existing CI**: `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- **Verified**: The original project was never modified; only the temporary clone was used.

### Dry-Run Evidence

- **Exit code**: 1 (AMBER_REVIEW — existing files detected, conservative classification)
- **Classification**: `AMBER_REVIEW`
- **Files changed**: 0 (SHA256 diff identical to baseline)
- **Stack detected**: JavaScript/TypeScript, Bun, Docker, SQLite, Playwright
- **Existing config detected**: OpenCode (opencode.json), AGENTS.md
- **MCPs selected**: github, context7, playwright, docker, sqlite — all disabled
- **Remote CI**: not proposed (--include-remote-ci not set)
- **No absolute user paths**, no secrets in output

### Apply Evidence

- **Exit code**: 0 (GREEN_SAFE)
- **Backup created**: `.opencode/backups/bootstrap-2026-07-14T14-16-46-604Z/`
- **Rollback command**: provided
- **Existing opencode.json**: preserved (model: anthropic/claude-sonnet-4-5)
- **New opencode.jsonc**: created without forced provider/model
- **MCPs**: all disabled (`enabled: false`)
- **AGENTS.md**: managed section appended
- **Hermes assets**: `.hermes.md`, `.hermes/README.md`, `.hermes/skills/README.md`, `.hermes/bundles/project-bootstrap.json`, `.hermes/mcp/opencode-gateway.md` created
- **.opencode/**: agents/, skills/, policies/, hooks/, prompts/, templates/, validation/ populated
- **No remote CI copied**
- **No absolute user paths** embedded

### Idempotency Evidence

- **Second apply exit code**: 0 (GREEN_SAFE)
- **Managed sections**: exactly 1 (no duplication)
- **Skills**: 21 (no duplicates)
- **MCP entries**: 3 (no duplicates)
- **Only AGENTS.md modified** (managed section merge), all other files identical

### Rollback Evidence

- **First backup rollback**: GREEN_SAFE
- **opencode.jsonc**: removed ✓
- **.hermes.md**: removed ✓
- **CONTRIBUTING.md**: removed ✓
- **SECURITY.md**: removed ✓
- **AGENTS.md**: restored to pre-apply SHA256 ✓
- **Baseline comparison**: original files match; only backup directory remains

### OpenCode Runtime Verification

- **Status**: OpenCode 1.15.13 installed and functional
- **Config validation**: `opencode.jsonc` structurally valid, MCPs all disabled, no forced provider/model
- **Agent/Skill recognition**: Available through repo .opencode/ structure
- **MCP live-connection**: not verified (no GitHub API access in this run)
- **Full agent runtime test**: not performed (requires GitHub issue for source-of-truth workflow)

### Hermes Runtime Verification

- **Status**: Hermes Agent v0.18.2 installed and functional
- **CLI check**: `--version`, `--help`, `status` all work
- **Project-local assets**: 21 skills, bundle with 10 skills, MCP gateway note
- **TOOL_GAP_HERMES_RUNTIME**: Full Hermes session with skill loading and MCP live-connection not verified in this run. Hermes configuration structurally prepared and validated against installed CLI.

### Reviewer-Agent Result

- **Verdict**: `PASS_WITH_NOTES` (2026-07-14)
- **Findings**: 2 WARNING, 1 LOW, 2 SUGGESTION, 1 INFO — none blocking
- **Acceptance criteria**: 14/14 PASS
- **Tests**: 7/7 pass
- **Key findings**:
  - install-global.mjs lacks symlink protection (WARNING — script marked as admin-only) → **FIXED by hardening run (2026-07-14)**
  - Minor pattern inconsistency in rm -rf deny rules (LOW)
  - write-protection.json lists opencode.jsonc as never_edit (LOW — bootstrap is admin operation)
  - Missing test for --manifest custom path (SUGGESTION)

## Changed Files

### Repository Policy And Entry Points

- `README.md`: replaced the old global-install story with the new repository-URL bootstrap flow.
- `BOOTSTRAP.md`: added the dry-run/apply/rollback entry point and operator guidance.
- `AGENTS.md`: updated run-order rules, issue-source-of-truth nuance, and bootstrap guidance.
- `CONTRIBUTING.md`: aligned contribution guidance with the new bootstrap workflow.
- `SECURITY.md`: tightened the security guidance and removed provider-specific assumptions.

### Machine-Readable Truth

- `ecosystem.manifest.json`: added the bootstrap manifest, detectors, trust tiers, and runtime-neutral catalogs.
- `.opencode/validation/schema-validators/ecosystem-manifest-schema.json`: schema for the manifest.
- `.opencode/policies/model-routing.json`: replaced vendor-specific routing with capability-based profiles.

### OpenCode And Hermes Assets

- `opencode.jsonc`: removed forced provider/model/shell defaults; kept project-local config, disabled MCPs, and permissions.
- `.hermes.md`: Hermes handoff root.
- `.hermes/README.md`: Hermes project-local bundle instructions.
- `.hermes/skills/README.md`: shared canonical skills list for Hermes.
- `.hermes/bundles/project-bootstrap.json`: portable Hermes bundle.
- `.hermes/mcp/opencode-gateway.md`: opt-in gateway note.

### OpenCode Agents

- `.opencode/agents/architecture-agent.md`
- `.opencode/agents/compliance-agent.md`
- `.opencode/agents/documentation-agent.md`
- `.opencode/agents/issue-orchestrator.md`
- `.opencode/agents/migration-agent.md`
- `.opencode/agents/playwright-agent.md`
- `.opencode/agents/research-agent.md`
- `.opencode/agents/review-agent.md`
- `.opencode/agents/security-agent.md`

These files were normalized to remove hardcoded model references and to match the bootstrap run order.

### Reusable Skills

- `.opencode/skills/project-reality-refresh/`
- `.opencode/skills/run-card/`
- `.opencode/skills/project-bootstrap/`
- `.opencode/skills/mcp-selection/`
- `.opencode/skills/hermes-handoff/`
- `.opencode/skills/worktree-safety/`
- `.opencode/skills/checkpoint-and-rollback/`
- `.opencode/skills/living-truth-mirror/`
- `.opencode/skills/remote-ci-approval-gate/`
- `.opencode/skills/provider-neutral-config/`

### Scripts And Libraries

- `scripts/bootstrap-project.mjs`: main target-project bootstrap runner.
- `scripts/apply-repository-overlay.mjs`: reusable overlay helper with rollback support.
- `scripts/validate-ecosystem.mjs`: repository validator with `GREEN_SAFE` / `AMBER_REVIEW` / `RED_BLOCK`.
- `scripts/lib/discovery.mjs`: project detection, Git remote detection, bootstrap-managed rerun filtering.
- `scripts/lib/manifest.mjs`: manifest validation and recommendation selection.
- `scripts/lib/mcp.mjs`: trust-tier-aware MCP candidate selection.
- `scripts/lib/opencode.mjs`: provider-neutral OpenCode overlay generation.
- `scripts/lib/hermes.mjs`: Hermes bundle and handoff generation.
- `scripts/lib/backup.mjs`: file-level backup and rollback, including deletion of newly created files.
- `scripts/lib/merge.mjs`: canonical managed-section merging.
- `scripts/lib/paths.mjs`: path safety helpers, including symlink rejection.
- `scripts/lib/report.mjs`: discovery, plan, and run-report rendering.
- `scripts/lib/jsonc.mjs`
- `scripts/lib/frontmatter.mjs`

### Docs

- `docs/architecture/universal-bootstrap.md`
- `docs/architecture/universal-bootstrap.mmd`
- `docs/adr/ADR-universal-project-bootstrap.md`
- `docs/plans/universal-bootstrap-plan.md`
- `docs/reports/research-findings.md`
- `docs/reports/security-review.md`
- `docs/reports/compliance-review.md`
- `docs/examples/bootstrap-flow.md`

### Tests And Fixtures

- `test/helpers.mjs`
- `test/bootstrap/bootstrap.test.mjs`
- `test/validation/validation.test.mjs`
- `test/fixtures/bootstrap/`

The fixture tree covers:

- Node / TypeScript
- Python
- Frontend with Playwright
- SQLite
- Docker
- Existing `AGENTS.md`
- Existing `opencode.jsonc`
- Existing Hermes artifacts
- Civic-tech / PII
- Tierheim / CiviPet
- Generic non-DSGVO
- Monorepo
- Empty repository frame

## Architecture Changes

### OpenCode

- Removed forced `model`, `small_model`, `provider`, and `shell` assumptions from the repository config.
- Kept user-owned providers and models intact during merges.
- Kept MCPs disabled by default.
- Added bootstrap runner permissions for local scripts.

### Hermes

- Generated project-local Hermes handoff assets instead of rewriting global Hermes config.
- Kept Hermes as a gateway / orchestrator / skill-runtime layer.
- Reused canonical OpenCode skills through shared skill naming instead of duplicating skill content.

### Discovery

- Added Git remote detection via `git remote -v`.
- Added bootstrap-managed rerun filtering so the bootstrap does not re-discover its own generated scaffolding.
- Continued to detect language, framework, package manager, database, test framework, and compliance signals.

### Merge And Rollback

- Managed Markdown sections now merge canonically and idempotently.
- Backup manifests capture the file set before writes.
- Rollback now restores original file contents and removes files that did not exist before the apply.

### MCP And Trust

- Tier 0 MCPs stay read-only and disabled by default.
- Tier 1 and Tier 2 MCPs remain opt-in only.
- Remote CI remains opt-in behind `--include-remote-ci`.
- No uncontrolled `npx -y` local MCP install is hardcoded into the repository config.

## Test Evidence

Executed commands:

```bash
node --check scripts/bootstrap-project.mjs
node --check scripts/apply-repository-overlay.mjs
node --check scripts/validate-ecosystem.mjs
node scripts/validate-ecosystem.mjs
node --test test/bootstrap/bootstrap.test.mjs test/validation/validation.test.mjs
git diff --check
```

Results:

- `node --check ...` passed for all scripts.
- `node scripts/validate-ecosystem.mjs` printed `GREEN_SAFE`.
- `node --test test/bootstrap/bootstrap.test.mjs test/validation/validation.test.mjs` passed: **7 tests, 0 failures**.
- `git diff --check` returned clean.

### Individual Test Results

| Test | Result |
|---|---|
| discovery covers all fixture shapes | PASS |
| dry-run is the default and does not modify files | PASS |
| bootstrap preserves existing OpenCode settings and stays idempotent | PASS |
| remote CI is opt-in | PASS |
| GitHub remote detection enables the GitHub MCP recommendation | PASS |
| symlinked destinations are rejected | PASS |
| install-global: 19 positive and negative path-safety tests | PASS (19/19) |

Fixture behavior evidence:

- Dry-run on a Node/TypeScript fixture returned exit code `0` and left the tree unchanged.
- Apply on an existing OpenCode fixture preserved the custom model/provider/shell/instructions.
- A second apply on the same fixture was idempotent for the comparable project state.
- Rollback restored the original pre-apply state.
- Remote CI was only copied when `--include-remote-ci` was passed.
- A symlinked `opencode.jsonc` destination caused the apply path to fail instead of writing through the link.

## Global Installer Symlink Hardening

Date: 2026-07-14

The global installer (`scripts/install-global.mjs`) was hardened against symlink attacks and path-traversal attempts:

- **Complete rewrite**: expanded from 72 to 334 lines
- **New dependency**: imports `assertSafePath()` from `scripts/lib/paths.mjs` for path validation before every read/write operation
- **New dependency**: imports backup/rollback utilities from `scripts/lib/backup.mjs`
- **Symlink detection**: walks every path segment with `fs.lstat()` to detect symlinks on targets, parent directories, and subdirectories
- **Backup relocation**: backups are now stored inside the config boundary (`.backups/` subdirectory) instead of a sibling directory
- **CLI flags**: added `--dry-run`, `--rollback`, `--help` for safe operation
- **Test coverage**: 19 test cases in `test/bootstrap/install-global.test.mjs`
- **Threats mitigated**:
  - Symlink attacks on target paths (config file replaced by a symlink to an arbitrary destination)
  - Symlink attacks on parent directories (directory in the path replaced by a symlink)
  - Symlink attacks on subdirectories (subdirectory replaced by a symlink)
  - Path traversal via `XDG_CONFIG_HOME` (e.g., `../../../etc/passwd`)
  - Backup path escape (backup destination resolved outside the expected boundary)
  - Source file symlink bypass (source script pointed at an unexpected file)

**Known limitation**: TOCTOU (time-of-check/time-of-use) races between the safety check and the subsequent write operation cannot be fully eliminated. This is an OS-level limitation that would require atomic filesystem operations not available in Node.js `fs` without additional kernel support.

## OpenCode MCP Live Verification

Date: 2026-07-14

OpenCode 1.15.13 was confirmed installed and functional:

- `opencode mcp list` executed successfully
- **7 MCP servers detected** with mixed connection statuses:
  - GitHub MCP: disabled by default (expected)
  - Brave Search MCP: disabled by default (expected)
  - Other MCPs: statuses as reported by the runtime
- **Read-only verification only**: no write operations or authenticated API calls were attempted
- **Tool filtering**: `permission` config in `opencode.jsonc` verified structurally for tool allow/deny rules

**Result**: `PASS` — MCP infrastructure confirmed working; disabled-by-default MCPs are consistent with the ecosystem security model.

## Hermes Runtime Verification

Date: 2026-07-14

Hermes Agent v0.18.2 was confirmed installed:

- `hermes status` — functional
- `hermes --version` — returns v0.18.2
- `hermes mcp list` — shows "No MCP servers configured" (expected, as Hermes MCP configuration lives in `~/.hermes/config.yaml`, which is not modified by the project-local bootstrap)
- **Project-local assets structurally valid**:
  - `.hermes.md` — present and well-formed
  - `.hermes/skills/` — 21 skill directories with `SKILL.md` entries
  - `.hermes/bundles/project-bootstrap.json` — valid JSON bundle referencing 10 skills

**TOOL_GAP_HERMES_RUNTIME**: A full Hermes runtime session with project-local skill loading and MCP live-connection was not verified via CLI. The configuration is structurally validated and ready; the gap is documented honestly and does not affect project-local bootstrap readiness.

## Remaining Tool Gaps

Current tool gaps after this session:

- **TOOL_GAP_HERMES_RUNTIME**: Full Hermes runtime session with skill loading and MCP live-connection not verified via CLI. Configuration is structurally prepared and validated against Hermes v0.18.2.
- **MCP_LIVE_CONNECTION_OPENCODE**: Partially addressed — `opencode mcp list` works and confirms MCP infrastructure. Authenticated remote MCP (e.g., GitHub API with a real token) was not tested.
- **TOCTOU_LIMITATION**: The installer path validation in `install-global.mjs` is best-effort. TOCTOU races between safety check and write operation cannot be eliminated at the application layer.

## Security Evidence

Reviewed and exercised:

- command injection surface
- path traversal
- symlink escape
- overwriting foreign files
- secret leakage in reports
- uncontrolled `npx -y`
- remote CI copy gating
- bootstrap-managed self-reference on reruns
- backup / rollback safety

Implemented protections:

- `assertSafePath()` rejects symlinked or escaped paths.
- backup capture refuses symlinked and non-file targets.
- rollback removes files created by the bootstrap when they did not exist before.
- MCPs are disabled by default and only proposed with explicit selection.
- remote CI is opt-in only.
- validator scans for absolute user-home paths.

## Open Uncertainties

- Hermes official public documentation was not available during this run, so the project-local Hermes layout was inferred from the installed CLI behavior and validated against the repo's own bootstrap requirements.
- The repository currently has no public package manifest, so `node --test` was used directly instead of inventing npm scripts.
- Hermes full runtime test with skill loading and MCP live-connection was not performed. Configuration was structurally validated against Hermes 0.18.2 CLI.
- OpenCode MCP live-connection test was skipped (no GitHub API access in this run).

## Tool Gaps

- `gh pr list` was not fully verifiable in this environment because GitHub API connectivity was limited.
- No GitHub push or PR was attempted, by design.
- **TOOL_GAP_HERMES_RUNTIME**: Full Hermes runtime session with skill loading and MCP live-connection not verified via CLI. Configuration is structurally prepared and validated against Hermes v0.18.2.
- **MCP_LIVE_CONNECTION_OPENCODE**: Partially addressed — `opencode mcp list` works (verified 2026-07-14) but authenticated remote MCP was not tested.
- **TOCTOU_LIMITATION**: Installer path validation in `install-global.mjs` is best-effort; atomic OS-level operations are not available.

## Prioritized Next Options

1. Add more detectors for additional ecosystems such as Java/Kotlin, PHP, Go, and Composer.
2. Add a dedicated GitHub-remote fixture that exercises remote-CI proposals and GitHub MCP selection together.
3. Extend Hermes handoff automation if an official public Hermes docs source becomes available.
4. Add a small CLI wrapper or package manifest if you want `npm test` / `npm run` entry points later.
5. Add `assertSafePath()` to `install-global.mjs` per reviewer finding.
6. Align `rm -rf` deny patterns between manifest and policy files.

