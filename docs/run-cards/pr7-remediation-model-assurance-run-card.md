# Run Card — PR #7 Remediation & Model Assurance

## Goal

Repair the confirmed PR #7 installer/runtime regression (redaction.mjs not installed, causing `ERR_MODULE_NOT_FOUND`) and then implement a Model Assurance module with the `/speckit.opencode-evidence.model-audit` slash command.

## Why Necessary

The PR #7 audit confirmed:
1. The installer reports `GREEN_SAFE` but fails to install `scripts/lib/security/redaction.mjs`, causing the resident runtime to crash with `ERR_MODULE_NOT_FOUND`.
2. The resident runtime test falsely accepts the import error as a passing result.
3. Documentation claims 425 tests when only 375 are actually executed.
4. Multiple evidence references are missing or stale.
5. PR scope/title does not accurately describe the full change set.

These defects must be repaired before the PR can proceed to review. Additionally, a Model Assurance module is required to prevent similar regressions from reaching PR state.

## Risk Tier

**HIGH_HUMAN_GATE** — Infrastructure (installer, resident runtime), security-relevant (runtime enforcement), PII-adjacent (redaction module), multiple distributed files.

## Context Level

**WARM** — Reality Refresh complete, audit artifacts read, affected files identified, risk tier determined. Transition to HOT requires Owner Approval.

## Source of Truth

- Local run report (this document) — temporary source of truth (no GitHub issue exists)
- Audit artifacts: `/tmp/pr7-full-audit.H8HLym/` (confirmed readable)
- PR #7: https://github.com/xxammaxx/OpenCode-Agenten-Oekosystem/pull/7 (OPEN, DRAFT)

## Scope

### Phase A — PR Regression Repair
- `scripts/install-governance.mjs` — Add `redaction.mjs` to `getRuntimeFileList()`
- `scripts/lib/security/redaction.mjs` — No changes needed (file exists, just not copied)
- `test/install/resident-runtime.test.mjs` — Fix false-positive test acceptance
- `test/install/url-installer.test.mjs` — Potentially update for new file count
- `integrations/spec-kit/README.md` — Fix test count claims
- `docs/reports/spec-kit-integration-final-report.md` — Fix test count and head references
- `docs/reports/pr7-scope-correction-proposal.md` — NEW: PR scope documentation
- Multiple evidence references — Fix or remove

### Phase B — Model Assurance Module (only if Phase A achieves GREEN_SAFE_PR_RUNTIME_REMEDIATED_LOCALLY)
- `integrations/spec-kit/extensions/opencode-evidence/` — New slash command, commands, tests
- `integrations/model-assurance/` — Public probes, evaluator, schemas, templates
- `test/model-assurance/` — Fixtures, fake models, integration tests
- `.opencode/model-assurance/model-registry.json` — Model evaluation registry
- `docs/architecture/model-assurance.md` — Architecture documentation
- `docs/guides/model-assurance-usage.md` — Usage guide
- `docs/security/model-assurance-threat-model.md` — Threat model

## Out of Scope

- No work in the main working tree (`/media/xxammaxx/projekte/OpenCode-Agenten-Oekosystem`)
- No direct changes to the `agent/url-installer-runtime-enforcement` branch
- No GitHub actions (commit, push, PR update, review request, merge)
- No external provider calls without explicit approval
- No changes to CI workflows
- No database migrations

## Hard Constraints

1. **No commit, no push, no PR update, no merge, no release.**
2. **No invented agents.** No build agent, no test agent.
3. **No work in the main working tree.**
4. **All changes in isolated worktree** at `/tmp/tmp.TftyfKa4sG/pr7-remediation-model-assurance`
5. **Phase B starts only after Phase A achieves `GREEN_SAFE_PR_RUNTIME_REMEDIATED_LOCALLY`.**
6. **Installer must fail-closed:** GREEN only when all runtime files are present and importable.
7. **No external provider calls** without `--allow-provider-calls` and verified budget.
8. **No fake execution:** all test results must be actual output.

## Non-Touch Areas

- `opencode.jsonc`, `opencode.json`
- `.opencode/policies/*.json`
- `.opencode/agents/*.md`
- `.github/workflows/*.yml`
- `SECURITY.md`, `LICENSE`
- Main working tree: `/media/xxammaxx/projekte/OpenCode-Agenten-Oekosystem`

## Involved Agents

| Agent | Role | Phase |
|-------|------|-------|
| `issue-orchestrator` | Coordination, delegation | All |
| **Main OpenCode Session** | Implementation, test execution | All |
| `review-agent` | Independent review (Phase A & B) | A, B |
| `security-agent` | Security review of installer, redaction | A |
| `documentation-agent` | Documentation truth mirror | A |
| `research-agent` | Only if external docs needed | B (conditional) |

**NOT involved:** `build` (PROHIBITED), `test` (DOES NOT EXIST), `plan` (analysis only if needed)

## Verification Contract

See: `docs/verification/pr7-remediation-model-assurance-contract.md`

## Red Tests

### Phase A
1. `test/install/red-test-redaction-installed.test.mjs` — NEW: Fails when redaction.mjs is not installed (RED before fix, GREEN after)
2. `test/install/red-test-resident-import.test.mjs` — NEW: Fails when resident runtime import fails (RED before fix, GREEN after)
3. `test/install/red-test-installer-fail-closed.test.mjs` — NEW: Fails when installer reports GREEN despite missing file (RED before fix, GREEN after)

### Phase B
Red tests for fake models and audit replay probes — see verification contract.

## Test Matrix

### Phase A
- [ ] `node --test test/install/resident-runtime.test.mjs` — Resident runtime tests
- [ ] `node --test test/install/url-installer.test.mjs` — URL installer tests
- [ ] `node --test test/install/red-test-redaction-installed.test.mjs` — NEW red test
- [ ] `node --test test/install/red-test-resident-import.test.mjs` — NEW red test
- [ ] `node --test test/install/red-test-installer-fail-closed.test.mjs` — NEW red test
- [ ] `node --test` — Full existing test suite
- [ ] `node scripts/validate-ecosystem.mjs` — Validator
- [ ] `git diff --check` — Whitespace check
- [ ] `node --check` on all modified files

### Phase B
- [ ] Model assurance integration tests
- [ ] Fake model tests (10 fake models)
- [ ] Audit replay probe tests
- [ ] All Phase A tests (regression guard)

## Evidence Plan

```text
evidence/pr7-remediation-<TIMESTAMP>/
├── 00-environment.md
├── 01-pre-fix-installer.txt
├── 02-pre-fix-installed-files.txt
├── 03-pre-fix-resident-runtime.txt
├── 04-pre-fix-reproduction.md
├── 05-red-test-before-fix.txt
├── 06-post-fix-installer.txt
├── 07-post-fix-installed-files.txt
├── 08-post-fix-resident-runtime.txt
├── 09-post-fix-test-suite.txt
├── 10-validator.txt
├── 11-merge-simulation.txt
└── 12-phase-a-gate-decision.md
```

## Owner-Approval-Status

| Gate | Status | Notes |
|------|--------|-------|
| Apply | APPROVED | Owner approved local worktree changes per order §5 |
| Commit | NOT_REQUESTED | Not authorized in this run |
| Push | NOT_REQUESTED | Not authorized in this run |
| PR | NOT_REQUESTED | Not authorized in this run |
| Merge | NOT_REQUESTED | Not authorized in this run |
| Deploy | NOT_REQUESTED | Not authorized in this run |
| Remote-CI | NOT_REQUESTED | Not authorized in this run |
| Skill Write | NOT_REQUESTED | |
| Memory Write | NOT_REQUESTED | |

## Rollback Strategy

All changes in isolated worktree. To rollback:
1. Remove the worktree: `git worktree remove /tmp/tmp.TftyfKa4sG/pr7-remediation-model-assurance`
2. Remove the branch: `git -C /media/xxammaxx/projekte/OpenCode-Agenten-Oekosystem branch -D feature/pr7-remediation-model-assurance`
3. No changes to main working tree exist, so no additional rollback needed.

## Expected Completion Classification

```text
GREEN_SAFE_PR_REMEDIATED_AND_MODEL_ASSURANCE_MVP
```

or (if Phase B incomplete):

```text
GREEN_SAFE_PR_RUNTIME_REMEDIATED_LOCALLY
AMBER_REVIEW_MODEL_ASSURANCE_INCOMPLETE
```
