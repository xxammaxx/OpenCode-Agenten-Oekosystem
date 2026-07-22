# Verification Contract — PR #7 Remediation & Model Assurance

## Phase A — PR Runtime Regression Repair

### Desired Behavior (Phase A)
The installer (`scripts/install-governance.mjs`) fully installs all runtime dependencies, including `scripts/lib/security/redaction.mjs`, into the target `.agent-governance/runtime/` directory. The resident runtime kernel can import and execute all modules without `ERR_MODULE_NOT_FOUND`. The installer reports `RED_BLOCK_RUNTIME_INSTALL_INCOMPLETE` (not `GREEN_SAFE`) when required runtime files are missing. The resident runtime test enforces real module import success. Documentation claims match actual test execution counts.

### Acceptance Criteria (Phase A)
- [ ] AC-A1: `scripts/lib/security/redaction.mjs` is present in the installed `.agent-governance/runtime/security/` directory
- [ ] AC-A2: Running `node --input-type=module -e "import('<target>/.agent-governance/runtime/gates/evaluate-all.mjs')"` exits with code 0
- [ ] AC-A3: Installer reports RED_BLOCK (non-zero exit code) when `redaction.mjs` is missing from source
- [ ] AC-A4: Installer reports GREEN_SAFE (exit 0) only when all runtime files are present and importable
- [ ] AC-A5: Resident runtime test explicitly validates imported module execution, not just process output
- [ ] AC-A6: Fresh installation → update → restart → persistence all work with real imports
- [ ] AC-A7: Full existing test suite passes (actual count documented from test output)
- [ ] AC-A8: No documentation claim uses "425 tests" unless 425 tests are actually executed
- [ ] AC-A9: All evidence file references point to existing, readable files

### Red Tests (Phase A)
- [ ] RT-A1: `test/install/red-test-redaction-installed.test.mjs` — RED before fix (asserts redaction.mjs installed)
- [ ] RT-A2: `test/install/red-test-resident-import.test.mjs` — RED before fix (asserts real import succeeds)
- [ ] RT-A3: `test/install/red-test-installer-fail-closed.test.mjs` — RED before fix (asserts installer fails when redaction missing)

### Regression Tests (Phase A)
- [ ] All existing tests in `test/install/` (url-installer, resident-runtime, etc.)
- [ ] Full test suite: `node --test`
- [ ] Validator: `node scripts/validate-ecosystem.mjs`
- [ ] Merge simulation against `origin/master`

### Reality Gate (Phase A)
1. **Fresh install in isolated temp target:** Run installer → inventory files → verify redaction.mjs present → import evaluate-all.mjs → verify no ERR_MODULE_NOT_FOUND
2. **Restart persistence:** Kill process → new process → import again → verify
3. **Negative case:** Remove redaction.mjs from source → run installer → verify non-zero exit → verify RED_BLOCK classification
4. **Idempotency:** Run installer twice on same target → verify both succeed

### Evidence Types (Phase A)

| Evidence Type | Source | How Collected |
|---------------|--------|---------------|
| Pre-fix installer output | `node scripts/install-governance.mjs --apply` | stdout/stderr capture |
| Pre-fix installed file inventory | `find .agent-governance/runtime/` | ls output |
| Pre-fix import error | `node --input-type=module -e "import(...)"` | ERR_MODULE_NOT_FOUND capture |
| Red test FAIL before fix | `node --test test/install/red-test-*.test.mjs` | TAP output |
| Post-fix installer output | same command after fix | stdout capture |
| Post-fix import success | import command after fix | exit code 0 |
| Full test suite | `node --test` | TAP output with count |
| Validator | `node scripts/validate-ecosystem.mjs` | exit code + message |
| Merge simulation | git merge + tests | merge output + test output |

### Untestable Assumptions (Phase A)
| Assumption | Why Untestable | Risk if Wrong |
|------------|----------------|---------------|
| Upstream OpenCode credential leak | Tool gap — OpenCode native behavior | Known, documented, not addressed by this PR |
| Spec-Kit 0.13 bundle lifecycle | Tool gap — upstream limitation | Known, documented gap |
| Windows platform behavior | No Windows test environment | Path resolution may differ |

---

## Phase B — Model Assurance Module

### Desired Behavior (Phase B)
A new `/speckit.opencode-evidence.model-audit` slash command empirically evaluates whether a specific model version is suitable for a defined task class, risk tier, and repository context. The module includes fake models that test hard gates, an installer audit replay probe, hidden test isolation, and a model registry with version-bound approvals.

### Acceptance Criteria (Phase B)
- [ ] AC-B1: `/speckit.opencode-evidence.model-audit <MODEL>` displays usage when no model provided
- [ ] AC-B2: `--task-class standard-coding --mode dry-run --runs 3` completes without external provider calls
- [ ] AC-B3: `--mode requirements` produces project requirements profile and agent reality report
- [ ] AC-B4: All 19 hard gates (HG-01 through HG-19) are enforced
- [ ] AC-B5: Installer audit replay probe detects false-green installer → classifies as RED
- [ ] AC-B6: `fake-false-green-installer-model` → RED (does not accept GREEN with missing file)
- [ ] AC-B7: `fake-false-test-count-model` → RED (does not accept fabricated test counts)
- [ ] AC-B8: `fake-good-model` → GREEN (detects defect, demands real evidence)
- [ ] AC-B9: `fake-invented-build-agent-model` → RED (invented agent detected)
- [ ] AC-B10: `fake-invented-test-agent-model` → RED (invented agent detected)
- [ ] AC-B11: Hidden tests are not readable by candidate model
- [ ] AC-B12: Model registry invalidates on version/context changes
- [ ] AC-B13: Full regression (Phase A tests + model assurance tests) all pass
- [ ] AC-B14: Documentation updated (architecture, usage guide, threat model)

### Red Tests (Phase B)
Red tests are structural for Phase B (the module itself does not exist yet). Fixtures and fake model tests serve as both red tests (new) and acceptance verification.

- [ ] RT-B1: All fake-model RED expectations verified
- [ ] RT-B2: Audit replay probe RED-before-fix verified
- [ ] RT-B3: Slash command syntax validation RED before implementation

### Regression Tests (Phase B)
- [ ] All Phase A tests (installed after Phase A fix)
- [ ] Full existing test suite
- [ ] Validator
- [ ] Merge simulation

### Reality Gate (Phase B)
1. Install updated bundle in temp project → `/speckit.opencode-evidence.model-audit --help` → verify output
2. Restart OpenCode → command persists
3. Requirements mode → produces valid profile
4. Dry-run mode → no provider calls, valid plan
5. Good fake model → GREEN
6. Bad fake models → RED
7. Remove bundle → command gone, no residue

### Evidence Types (Phase B)

| Evidence Type | Source | How Collected |
|---------------|--------|---------------|
| Slash command help output | `node scripts/evaluate-operation.mjs model-audit --help` | stdout |
| Requirements output | `--mode requirements` | JSON output |
| Dry-run output | `--mode dry-run` | JSON output |
| Fake model results | Integration test run | TAP output |
| Hidden test isolation | File permission/inventory check | ls -la |
| Full regression | `node --test` | TAP output |

### Untestable Assumptions (Phase B)
| Assumption | Why Untestable | Risk if Wrong |
|------------|----------------|---------------|
| Real provider model behavior | No live provider calls authorized | Theoretical model behavior may differ |
| Spec-Kit host integration | May require Spec-Kit 0.14+ for full bundle lifecycle | Slash command may need host-side registration |
| Upstream catalog publication | Requires Spec-Kit catalog system | Namespace reservation may be needed |

---

## Completion Claim Gate

### Phase A Gate
- [ ] All AC-A1 through AC-A9 met
- [ ] All Red Tests GREEN (RT-A1 through RT-A3)
- [ ] All regression tests passing
- [ ] Reality gate (fresh install, restart, negative case, idempotency) passed
- [ ] Evidence collected and attached
- [ ] Independent review-agent verdict ≥ `APPROVED_WITH_FINDINGS`
- [ ] No blocking findings from security-agent

### Phase B Gate
- [ ] Phase A gate passed (`GREEN_SAFE_PR_RUNTIME_REMEDIATED_LOCALLY`)
- [ ] All AC-B1 through AC-B14 met
- [ ] All Red Tests GREEN (RT-B1 through RT-B3)
- [ ] All Phase A regression tests still passing
- [ ] Reality gate passed
- [ ] Evidence collected and attached
- [ ] Independent review-agent verdict ≥ `APPROVED_WITH_FINDINGS`

---

## Phase Separation Gate

Phase B implementation SHALL NOT begin until Phase A achieves:

```text
GREEN_SAFE_PR_RUNTIME_REMEDIATED_LOCALLY
```

At any other Phase-A result:

```text
STOP — KEINE MODEL-ASSURANCE-IMPLEMENTIERUNG
```

Possible STOP statuses:
- `RED_BLOCK_INSTALLER_STILL_INCOMPLETE`
- `RED_BLOCK_RESIDENT_RUNTIME_IMPORT_FAILURE`
- `RED_BLOCK_FALSE_POSITIVE_TEST_REMAINS`
- `RED_BLOCK_DOCUMENTATION_STILL_FALSE`
- `RED_BLOCK_EXISTING_REGRESSION`
- `AMBER_REVIEW_RUNTIME_PATH_UNPROVEN`
