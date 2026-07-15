/**
 * Hard-Coded Kernel Gates
 *
 * 19 immutable gates that NO policy, adapter, or runtime can disable.
 * These are the floor — the minimum safety baseline for every operation.
 *
 * Gate Contract:
 * - Each gate is a pure function: (context) → { allowed: boolean, violations: [] }
 * - Every gate MUST return a result; gates that throw are treated as RED_BLOCK
 * - Policy files may reference kernel gates but may NEVER disable them
 * - Runtime adapters may add gates but may NEVER weaken kernel gates
 * - Kernel gates are evaluated FIRST, before any policy or project gates
 */

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, realpathSync, readFileSync } from 'node:fs';
import { resolve, relative, normalize, sep, isAbsolute } from 'node:path';
import {
  ForcePushViolation,
  SecretLeakViolation,
  PathEscapeViolation,
  SymlinkEscapeViolation,
  UnrelatedWorktreeWriteViolation,
  ProductionWriteViolation,
  RemoteActionViolation,
  FalseGreenViolation,
  FakeExecutionViolation,
  ReviewerWriteViolation,
  ApplyWithoutBackupViolation,
  RollbackWithoutManifestViolation,
  ApprovalReuseViolation,
  CrossActionApprovalViolation,
  CrossScopeApprovalViolation,
  ExpiredApprovalViolation,
  RuntimeAdapterOverrideViolation,
  GlobalRuntimeConfigWriteViolation,
  AGPLIncorporationViolation
} from './errors.mjs';
import { CLASSIFICATIONS, VERIFICATION_LEVELS } from './classifications.mjs';

// ── Gate Registry ─────────────────────────────────────────────────
// Each gate has an ID, a check function, and a constant "kernel-level" flag.
// The `kernel` flag is set to true at construction and frozen — no code path
// can set it to false after init.

const GATE_REGISTRY = [];

function registerKernelGate(id, description, checkFn) {
  const gateDef = Object.freeze({
    id,
    description,
    kernel: true, // IMMUTABLE — never false
    check: Object.freeze(checkFn)
  });
  GATE_REGISTRY.push(gateDef);
  return gateDef;
}

// ── Kernel Gate Definitions ───────────────────────────────────────

// 1. NO_FORCE_PUSH
registerKernelGate('NO_FORCE_PUSH', 'Force push is unconditionally blocked.', (ctx) => {
  const command = (ctx.command || '').toLowerCase();
  const isForceAction = (
    command.includes('--force') ||
    command.includes('-f ') ||
    command.includes('force-push') ||
    command.includes('push --force')
  );
  if (isForceAction) {
    return { allowed: false, violation: new ForcePushViolation({ evidence: { command: ctx.command } }) };
  }
  return { allowed: true };
});

// 2. NO_SECRET_LEAK
registerKernelGate('NO_SECRET_LEAK', 'Secret leakage in files or commands is blocked.', (ctx) => {
  const secretPatterns = [
    /api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}/i,
    /token\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]{20,}/i,
    /secret\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/i,
    /password\s*[:=]\s*['"]?[^\s'"]{6,}/i,
    /-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/,
    /ghp_[A-Za-z0-9]{36}/,
    /gho_[A-Za-z0-9]{36}/,
    /ghu_[A-Za-z0-9]{36}/,
    /ghs_[A-Za-z0-9]{36}/,
    /sk-[A-Za-z0-9]{32,}/
  ];

  const contentToCheck = [
    ctx.command || '',
    ctx.fileContent || '',
    ctx.fileName || '',
    ...(ctx.fileContents || [])
  ].filter(Boolean);

  for (const content of contentToCheck) {
    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        // Redact the match before adding to evidence (no secrets in evidence!)
        const redacted = content.replace(pattern, '[REDACTED_SECRET]');
        return {
          allowed: false,
          violation: new SecretLeakViolation({
            evidence: {
              pattern: pattern.toString(),
              redactedContent: redacted.substring(0, 200),
              sourceFile: ctx.fileName || 'command'
            }
          })
        };
      }
    }
  }

  return { allowed: true };
});

// 3. NO_PATH_ESCAPE
registerKernelGate('NO_PATH_ESCAPE', 'Path traversal and escape attempts are blocked.', (ctx) => {
  const pathsToCheck = [
    ctx.targetPath,
    ctx.writePath,
    ...(ctx.scopePaths || [])
  ].filter(Boolean);

  const worktreeRoot = normalize(ctx.worktreeRoot || ctx.targetRoot || process.cwd());

  for (const p of pathsToCheck) {
    const normalized = normalize(p);

    // Check for path traversal patterns
    if (normalized.includes('..')) {
      return {
        allowed: false,
        violation: new PathEscapeViolation({
          evidence: { path: p, pattern: '..', worktreeRoot }
        })
      };
    }

    // Check that the resolved path is within the worktree
    if (isAbsolute(normalized)) {
      const rel = relative(worktreeRoot, normalized);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        return {
          allowed: false,
          violation: new PathEscapeViolation({
            evidence: { path: p, resolved: normalized, worktreeRoot, relativePath: rel }
          })
        };
      }
    }
  }

  return { allowed: true };
});

// 4. NO_SYMLINK_ESCAPE
registerKernelGate('NO_SYMLINK_ESCAPE', 'Symlink escapes from the worktree are blocked.', (ctx) => {
  const pathsToCheck = [
    ctx.targetPath,
    ctx.writePath,
    ...(ctx.scopePaths || [])
  ].filter(Boolean);

  const worktreeRoot = normalize(ctx.worktreeRoot || ctx.targetRoot || process.cwd());

  for (const p of pathsToCheck) {
    const normalized = normalize(p);
    if (existsSync(normalized)) {
      try {
        const realPath = realpathSync(normalized);
        const resolved = resolve(normalized);
        if (realPath !== resolved) {
          // Symlink detected — verify it points within worktree
          const rel = relative(worktreeRoot, realPath);
          if (rel.startsWith('..') || isAbsolute(rel)) {
            return {
              allowed: false,
              violation: new SymlinkEscapeViolation({
                evidence: { path: p, realPath, worktreeRoot, relativePath: rel }
              })
            };
          }
        }
      } catch {
        // Path doesn't exist or can't be resolved — pass to path escape check
      }
    }
  }

  return { allowed: true };
});

// 5. NO_UNRELATED_WORKTREE_WRITE
registerKernelGate('NO_UNRELATED_WORKTREE_WRITE', 'Writes outside the authorized worktree scope are blocked.', (ctx) => {
  if (!ctx.writePath) return { allowed: true };

  const writePath = resolve(ctx.writePath);
  const worktreeRoot = normalize(ctx.worktreeRoot || ctx.targetRoot || process.cwd());
  const rel = relative(worktreeRoot, writePath);

  if (rel.startsWith('..') || isAbsolute(rel)) {
    return {
      allowed: false,
      violation: new UnrelatedWorktreeWriteViolation({
        evidence: { writePath, worktreeRoot, relativePath: rel }
      })
    };
  }

  return { allowed: true };
});

// 6. NO_PRODUCTION_WRITE_WITHOUT_APPROVAL
registerKernelGate('NO_PRODUCTION_WRITE_WITHOUT_APPROVAL', 'Production data writes require explicit scoped approval.', (ctx) => {
  const isProduction = (
    (ctx.targetPath || '').includes('production') ||
    (ctx.targetPath || '').includes('prod_db') ||
    (ctx.writePath || '').includes('production') ||
    (ctx.command || '').includes('production') ||
    ctx.environment === 'production'
  );

  if (isProduction && !ctx.approvalForProductionWrite) {
    return {
      allowed: false,
      violation: new ProductionWriteViolation({
        evidence: {
          targetPath: ctx.targetPath || ctx.writePath,
          environment: ctx.environment || 'detected_as_production',
          hasApproval: false
        }
      })
    };
  }

  return { allowed: true };
});

// 7. NO_REMOTE_ACTION_WITHOUT_SCOPED_APPROVAL
registerKernelGate('NO_REMOTE_ACTION_WITHOUT_SCOPED_APPROVAL', 'Remote actions require scoped approval.', (ctx) => {
  const remoteActions = ['git push', 'gh pr create', 'gh issue create', 'git push', 'npm publish', 'docker push', 'curl', 'wget'];
  const isRemote = (
    ctx.isRemote === true ||
    remoteActions.some(pattern => (ctx.command || '').toLowerCase().includes(pattern)) ||
    (ctx.action || '').startsWith('remote_')
  );

  if (isRemote && !ctx.approvalForRemote) {
    return {
      allowed: false,
      violation: new RemoteActionViolation({
        evidence: {
          command: ctx.command || ctx.action,
          hasApproval: false
        }
      })
    };
  }

  return { allowed: true };
});

// 8. NO_FALSE_GREEN
registerKernelGate('NO_FALSE_GREEN', 'False-GREEN classifications are detected and blocked.', (ctx) => {
  // A FALSE_GREEN is: claimed GREEN_SAFE but structural checks show RED_BLOCK conditions
  if (ctx.claimedClassification === CLASSIFICATIONS.GREEN_SAFE) {
    const actualChecks = ctx.actualResults || [];

    for (const check of actualChecks) {
      if (check.classification === CLASSIFICATIONS.RED_BLOCK) {
        return {
          allowed: false,
          violation: new FalseGreenViolation({
            evidence: {
              claimedClassification: CLASSIFICATIONS.GREEN_SAFE,
              actualBlockedBy: check.blockedBy || check.gateId || 'unknown',
              check: check
            }
          })
        };
      }
    }
  }

  return { allowed: true };
});

// 9. NO_FAKE_EXECUTION
registerKernelGate('NO_FAKE_EXECUTION', 'Fake execution (claiming a tool was run without actually running it) is blocked.', (ctx) => {
  // Indicators of fake execution:
  // - Claimed execution with no output
  // - All expected outputs are placeholders
  // - Execution time is impossibly fast
  if (ctx.claimedExecution && ctx.claimedExecution === true) {
    const hasEvidence = (
      ctx.executionOutput ||
      ctx.exitCode !== undefined ||
      ctx.executionTimeMs > 0 ||
      (ctx.evidencePresent && ctx.evidencePresent.length > 0)
    );

    if (!hasEvidence) {
      return {
        allowed: false,
        violation: new FakeExecutionViolation({
          evidence: {
            claimedExecution: true,
            executionOutput: null,
            executionTimeMs: ctx.executionTimeMs || 0
          }
        })
      };
    }
  }

  return { allowed: true };
});

// 10. NO_REVIEWER_WRITE
registerKernelGate('NO_REVIEWER_WRITE', 'Reviewer agent write operations are blocked.', (ctx) => {
  if (ctx.agentRole === 'reviewer' || ctx.agentId === 'review-agent') {
    const isWrite = (
      (ctx.action || '').includes('write') ||
      (ctx.action || '').includes('edit') ||
      (ctx.action || '').includes('create') ||
      (ctx.action || '').includes('delete') ||
      ctx.isWrite === true
    );

    if (isWrite) {
      return {
        allowed: false,
        violation: new ReviewerWriteViolation({
          evidence: {
            agentRole: ctx.agentRole || ctx.agentId,
            attemptedAction: ctx.action
          }
        })
      };
    }
  }

  return { allowed: true };
});

// 11. NO_APPLY_WITHOUT_BACKUP
registerKernelGate('NO_APPLY_WITHOUT_BACKUP', 'Apply operations require a prior backup.', (ctx) => {
  if (ctx.action === 'apply' && !ctx.hasBackup) {
    return {
      allowed: false,
      violation: new ApplyWithoutBackupViolation({
        evidence: { action: ctx.action, hasBackup: false }
      })
    };
  }

  return { allowed: true };
});

// 12. NO_ROLLBACK_WITHOUT_VALIDATED_MANIFEST
registerKernelGate('NO_ROLLBACK_WITHOUT_VALIDATED_MANIFEST', 'Rollback requires a validated manifest.', (ctx) => {
  if (ctx.action === 'rollback' && !ctx.hasValidatedManifest) {
    return {
      allowed: false,
      violation: new RollbackWithoutManifestViolation({
        evidence: { action: ctx.action, hasValidatedManifest: false }
      })
    };
  }

  return { allowed: true };
});

// 13. NO_APPROVAL_REUSE
registerKernelGate('NO_APPROVAL_REUSE', 'Single-use approval receipts cannot be reused.', (ctx) => {
  if (ctx.approvalStatus === 'CONSUMED' && ctx.isReuseAttempt) {
    return {
      allowed: false,
      violation: new ApprovalReuseViolation({
        evidence: {
          nonce: ctx.approvalNonce || 'unknown',
          originalAction: ctx.approvalAction || 'unknown',
          reuseAction: ctx.action || 'unknown'
        }
      })
    };
  }

  return { allowed: true };
});

// 14. NO_CROSS_ACTION_APPROVAL
registerKernelGate('NO_CROSS_ACTION_APPROVAL', 'Approval for one action cannot be used for another.', (ctx) => {
  if (ctx.approvalAction && ctx.requestedAction && ctx.approvalAction !== ctx.requestedAction) {
    return {
      allowed: false,
      violation: new CrossActionApprovalViolation({
        evidence: {
          approvalAction: ctx.approvalAction,
          requestedAction: ctx.requestedAction,
          nonce: ctx.approvalNonce || 'unknown'
        }
      })
    };
  }

  return { allowed: true };
});

// 15. NO_CROSS_SCOPE_APPROVAL
registerKernelGate('NO_CROSS_SCOPE_APPROVAL', 'Approval bound to one scope cannot be used for another.', (ctx) => {
  const scopeMismatches = [];

  if (ctx.approvalBranch && ctx.currentBranch && ctx.approvalBranch !== ctx.currentBranch) {
    scopeMismatches.push({ field: 'branch', approved: ctx.approvalBranch, current: ctx.currentBranch });
  }

  if (ctx.approvalRuntime && ctx.currentRuntime && ctx.approvalRuntime !== ctx.currentRuntime) {
    scopeMismatches.push({ field: 'runtime', approved: ctx.approvalRuntime, current: ctx.currentRuntime });
  }

  if (ctx.approvalFingerprint && ctx.currentFingerprint && ctx.approvalFingerprint !== ctx.currentFingerprint) {
    scopeMismatches.push({ field: 'fingerprint', message: 'Context fingerprint mismatch' });
  }

  if (scopeMismatches.length > 0) {
    return {
      allowed: false,
      violation: new CrossScopeApprovalViolation({
        evidence: {
          mismatches: scopeMismatches,
          nonce: ctx.approvalNonce || 'unknown'
        }
      })
    };
  }

  return { allowed: true };
});

// 16. NO_EXPIRED_APPROVAL
registerKernelGate('NO_EXPIRED_APPROVAL', 'Expired approval receipts are rejected.', (ctx) => {
  if (ctx.approvalExpiresAt) {
    const now = Date.now();
    const expiresAt = new Date(ctx.approvalExpiresAt).getTime();

    if (now > expiresAt) {
      return {
        allowed: false,
        violation: new ExpiredApprovalViolation({
          evidence: {
            expiresAt: ctx.approvalExpiresAt,
            now: new Date().toISOString(),
            nonce: ctx.approvalNonce || 'unknown'
          }
        })
      };
    }
  }

  return { allowed: true };
});

// 17. NO_RUNTIME_ADAPTER_OVERRIDE
registerKernelGate('NO_RUNTIME_ADAPTER_OVERRIDE', 'Runtime adapters may never override or weaken kernel gates.', (ctx) => {
  if (ctx.adapterAttemptedOverride === true) {
    return {
      allowed: false,
      violation: new RuntimeAdapterOverrideViolation({
        evidence: {
          adapterId: ctx.adapterId || 'unknown',
          attemptedGateOverride: ctx.attemptedGateId || 'unknown',
          kernelGate: ctx.kernelGateId || 'unknown'
        }
      })
    };
  }

  return { allowed: true };
});

// 18. NO_GLOBAL_RUNTIME_CONFIG_WRITE
registerKernelGate('NO_GLOBAL_RUNTIME_CONFIG_WRITE', 'Writing to global runtime configuration files is blocked.', (ctx) => {
  const globalConfigPaths = [
    `${process.env.HOME || '/home'}/.config/opencode/`,
    `${process.env.HOME || '/home'}/.hermes/`,
    `${process.env.HOME || '/home'}/.claude/`,
    `/etc/opencode/`,
    `/etc/hermes/`,
    `${process.env.APPDATA || ''}/opencode/`,
    `${process.env.LOCALAPPDATA || ''}/opencode/`
  ].filter(p => p.length > 3); // filter empty paths from undefined env vars

  const writePath = ctx.writePath || ctx.targetPath || '';
  const normalizedWritePath = normalize(resolve(writePath));

  for (const globalPath of globalConfigPaths) {
    const normalizedGlobalPath = normalize(resolve(globalPath));
    if (normalizedWritePath.startsWith(normalizedGlobalPath + sep) || normalizedWritePath === normalizedGlobalPath) {
      return {
        allowed: false,
        violation: new GlobalRuntimeConfigWriteViolation({
          evidence: {
            writePath: normalizedWritePath,
            globalConfigPath: normalizedGlobalPath
          }
        })
      };
    }
  }

  return { allowed: true };
});

// 19. NO_AGPL_INCORPORATION
registerKernelGate('NO_AGPL_INCORPORATION', 'AGPL-licensed source code incorporation is blocked.', (ctx) => {
  // Check if any file being written contains AGPL license headers
  const agplPatterns = [
    /GNU AFFERO GENERAL PUBLIC LICENSE/i,
    /AGPL-3\.0(-or-later)?/i,
    /Licensed under the GNU Affero/i,
    /GNU Affero General Public License for more details/i
  ];

  const contentToCheck = [
    ctx.fileContent || '',
    ...(ctx.fileContents || [])
  ].filter(Boolean);

  // Also check if any copied file is from a known AGPL source
  const isAgplSource = (
    (ctx.sourceRepository || '').includes('odysseus-dev/odysseus') ||
    (ctx.sourcePath || '').includes('odysseus') && !(ctx.sourcePath || '').includes('integrations/')
  );

  if (isAgplSource) {
    return {
      allowed: false,
      violation: new AGPLIncorporationViolation({
        evidence: {
          sourceRepository: ctx.sourceRepository || 'odysseus-dev/odysseus',
          sourcePath: ctx.sourcePath,
          reason: 'Source is from known AGPL-licensed repository. Only handoff artifacts allowed.'
        }
      })
    };
  }

  // Check content for AGPL license headers
  for (const content of contentToCheck) {
    for (const pattern of agplPatterns) {
      if (pattern.test(content)) {
        return {
          allowed: false,
          violation: new AGPLIncorporationViolation({
            evidence: {
              matchedPattern: pattern.toString(),
              reason: 'AGPL license text detected in file content. Incorporation blocked.'
            }
          })
        };
      }
    }
  }

  return { allowed: true };
});

// ── Kernel Evaluator ──────────────────────────────────────────────

/**
 * Evaluate ALL kernel gates against a context.
 * Returns consolidated result with all violations.
 *
 * This is the single entry point for kernel gate evaluation.
 * Each gate is evaluated independently — a violation in one gate
 * does not prevent other gates from evaluating.
 *
 * ALL kernel gates run always. No short-circuit.
 *
 * @param {Object} ctx - Evaluation context with all relevant fields
 * @returns {Object} { allowed, violations, gateResults }
 */
export function evaluateKernelGates(ctx = {}) {
  const violations = [];
  const gateResults = [];

  for (const gate of GATE_REGISTRY) {
    try {
      const result = gate.check(ctx);
      gateResults.push({
        gateId: gate.id,
        allowed: result.allowed,
        violation: result.violation || null
      });

      if (!result.allowed && result.violation) {
        violations.push(result.violation);
      }
    } catch (error) {
      // Gate threw an error — treat as RED_BLOCK
      gateResults.push({
        gateId: gate.id,
        allowed: false,
        error: error.message
      });
      violations.push({
        gateId: gate.id,
        code: `KERNEL_GATE_ERROR_${gate.id}`,
        message: `Kernel gate "${gate.id}" threw an error: ${error.message}`,
        severity: 'RED_BLOCK'
      });
    }
  }

  return {
    allowed: violations.length === 0,
    violations: Object.freeze(violations),
    gateResults: Object.freeze(gateResults),
    classification: violations.length > 0 ? CLASSIFICATIONS.RED_BLOCK : CLASSIFICATIONS.GREEN_SAFE,
    kernelGateCount: GATE_REGISTRY.length,
    passedGateCount: gateResults.filter(g => g.allowed).length,
    failedGateCount: violations.length
  };
}

/**
 * Get the immutable list of all kernel gate IDs.
 */
export function getKernelGateIds() {
  return Object.freeze(GATE_REGISTRY.map(g => g.id));
}

/**
 * Check if a gate ID is a kernel gate.
 */
export function isKernelGate(gateId) {
  return GATE_REGISTRY.some(g => g.id === gateId);
}

/**
 * Get the full kernel gate registry (read-only).
 */
export function getKernelGates() {
  return Object.freeze([...GATE_REGISTRY]);
}

/**
 * Verify that no external entity is attempting to override a kernel gate.
 * Used by the runtime adapter contract to detect rogue adapters.
 *
 * @param {Object} externalClaims - Gate results claimed by an adapter
 * @returns {{ clean: boolean, overrides: Array }}
 */
export function detectKernelGateOverrides(externalClaims = {}) {
  const overrides = [];
  const kernelGateIds = GATE_REGISTRY.map(g => g.id);

  // Check if external claims contradict kernel gates
  for (const gateId of kernelGateIds) {
    if (externalClaims[gateId] !== undefined && externalClaims[gateId] !== true) {
      overrides.push({
        gateId,
        kernelValue: true, // kernel gates are always enabled
        claimedValue: externalClaims[gateId],
        severity: 'RED_BLOCK'
      });
    }
  }

  // Check if external claims attempt to disable kernel gates
  const disabledGates = externalClaims.disabledKernelGates || [];
  for (const disabledGate of disabledGates) {
    if (kernelGateIds.includes(disabledGate)) {
      overrides.push({
        gateId: disabledGate,
        kernelValue: true,
        claimedValue: false,
        severity: 'RED_BLOCK'
      });
    }
  }

  return {
    clean: overrides.length === 0,
    overrides: Object.freeze(overrides)
  };
}

export default evaluateKernelGates;
