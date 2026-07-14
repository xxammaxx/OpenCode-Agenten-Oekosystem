# Universal Bootstrap Plan

## Run Card

- Goal: turn this repository into a universal bootstrap kit for OpenCode and Hermes Agent.
- Default mode: dry-run.
- Apply mode: explicit `--apply`.
- Remote CI: explicit `--include-remote-ci`.

## Scope

In scope:

- repository reality refresh
- manifest-driven project discovery
- OpenCode project bootstrap
- Hermes bundle bootstrap
- MCP selection and trust-tier gating
- backup and rollback
- validation and evidence reporting
- fixture-driven tests
- documentation refresh

Out of scope:

- automatic production deploys
- automatic package publishing
- automatic secret creation
- automatic remote CI enablement
- force-pushes
- destructive file operations

## Acceptance Criteria

- The bootstrap is safe by default and does not modify files during dry-run.
- Existing OpenCode provider and model choices are preserved when present.
- Existing project files are merged conservatively.
- MCP servers remain disabled unless explicitly enabled.
- Remote CI is only suggested when the opt-in flag is used.
- Hermes project-local artifacts are generated without touching global Hermes config.
- Rollback restores pre-apply content.
- Validation covers manifest, configs, skills, docs, and fixtures.
- Reports never contain secret material.

## Test Matrix

### Syntax and Schema

- `node --check scripts/bootstrap-project.mjs`
- `node --check scripts/validate-ecosystem.mjs`
- JSON validation for `ecosystem.manifest.json`
- JSONC validation for `opencode.jsonc`
- frontmatter validation for all `SKILL.md` and agent docs

### Functional

- dry-run on a Node/TypeScript fixture
- apply on a Python fixture
- apply on a frontend/Playwright fixture
- idempotent re-apply on the same fixture
- rollback on the same fixture

### Safety

- dry-run does not change files
- backups are created before apply
- rollback restores the previous state
- symlink escape attempts are blocked
- no absolute home-directory paths are written

### Domain Selection

- tierheim/CiviPet signals enable domain-specific compliance only when justified
- generic projects do not receive domain-specific policies
- remote CI is not copied without the explicit flag

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Command injection | Medium | High | Never pass untrusted text to shell; use argv arrays only |
| Path traversal | Medium | High | Resolve all writes under target root and reject escapes |
| Symlink escape | Medium | High | Refuse writes through unsafe symlinks |
| Secret leakage | Medium | High | Do not read `.env`; redact values from reports |
| MCP supply chain | Medium | High | Keep MCPs disabled by default; no uncontrolled `npx -y` |
| Remote CI drift | Medium | Medium | Gate workflow copying behind `--include-remote-ci` |
| Rollback failure | Low | High | Write backup manifest before apply and test rollback |

## Implementation Order

1. Finalize manifest and bootstrap docs.
2. Implement path, discovery, merge, backup, and report helpers.
3. Implement bootstrap and validator entrypoints.
4. Add OpenCode and Hermes project-local assets.
5. Add fixtures and tests.
6. Run validation, idempotency, and rollback checks.
7. Write the completion report.

## Rollback Plan

- Apply writes a timestamped backup directory inside the target project.
- The backup manifest stores the original and backup paths plus content hashes.
- Rollback restores files from the manifest and preserves unrelated files.
- If a write fails mid-run, the bootstrap stops and keeps the backup intact.

## Non-Goals

- replacing the user's own provider or model choices
- rewriting global OpenCode or Hermes configuration automatically
- auto-enabling remote CI
- storing secret material in the repository
- assuming one shell or one operating system
