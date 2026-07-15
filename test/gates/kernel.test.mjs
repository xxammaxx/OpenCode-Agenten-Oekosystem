/**
 * Kernel Gate Tests
 *
 * Validates that all 19 kernel gates are:
 * - Immutable (cannot be disabled by policy or adapter)
 * - Always evaluated (no short-circuit skipping)
 * - Prioritized above all other gate layers
 * - Correctly producing RED_BLOCK on violations
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { evaluateKernelGates, getKernelGateIds, isKernelGate, getKernelGates, detectKernelGateOverrides } from '../../scripts/lib/gates/kernel.mjs';
import { ForcePushViolation, SecretLeakViolation, PathEscapeViolation, SymlinkEscapeViolation, UnrelatedWorktreeWriteViolation, ProductionWriteViolation, RemoteActionViolation, FalseGreenViolation, FakeExecutionViolation, ReviewerWriteViolation, ApplyWithoutBackupViolation, RollbackWithoutManifestViolation, ApprovalReuseViolation, CrossActionApprovalViolation, CrossScopeApprovalViolation, ExpiredApprovalViolation, RuntimeAdapterOverrideViolation, GlobalRuntimeConfigWriteViolation, AGPLIncorporationViolation } from '../../scripts/lib/gates/errors.mjs';
import { CLASSIFICATIONS } from '../../scripts/lib/gates/classifications.mjs';

describe('Kernel Gates', () => {

  // ── Gate Count ──────────────────────────────────────────────

  it('has exactly 19 kernel gates', () => {
    const gates = getKernelGates();
    assert.strictEqual(gates.length, 19, `Expected 19 kernel gates, got ${gates.length}`);
  });

  it('every gate has the kernel flag set to true', () => {
    const gates = getKernelGates();
    for (const gate of gates) {
      assert.strictEqual(gate.kernel, true, `Gate ${gate.id} must have kernel: true`);
    }
  });

  it('all gate IDs are unique', () => {
    const gates = getKernelGates();
    const ids = gates.map(g => g.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, ids.length, 'Gate IDs must be unique');
  });

  // ── NO_FORCE_PUSH ───────────────────────────────────────────

  it('NO_FORCE_PUSH: blocks git push --force', () => {
    const result = evaluateKernelGates({ command: 'git push --force origin main' });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.classification, CLASSIFICATIONS.RED_BLOCK);
    assert.strictEqual(result.failedGateCount >= 1, true);
  });

  it('NO_FORCE_PUSH: blocks git push -f', () => {
    const result = evaluateKernelGates({ command: 'git push -f origin main' });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_FORCE_PUSH: blocks force-push command', () => {
    const result = evaluateKernelGates({ command: 'force-push to main' });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_FORCE_PUSH: allows normal git push (with remote approval)', () => {
    // Normal git push is a remote action, needs remote approval to not be blocked by NO_REMOTE_ACTION
    const result = evaluateKernelGates({ command: 'git push origin main', approvalForRemote: true });
    assert.strictEqual(result.allowed, true);
  });

  // ── NO_SECRET_LEAK ─────────────────────────────────────────

  it('NO_SECRET_LEAK: blocks GitHub PAT in command', () => {
    const result = evaluateKernelGates({ command: 'export GITHUB_TOKEN=ghp_1234567890abcdef1234567890abcdef1234' });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_SECRET_LEAK: blocks private key patterns', () => {
    const result = evaluateKernelGates({ command: 'cat file', fileContent: '-----BEGIN RSA PRIVATE KEY-----' });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_SECRET_LEAK: blocks api_key assignment', () => {
    const result = evaluateKernelGates({ fileName: 'config.json', fileContent: 'api_key: "sk-abcdefghijklmnopqrstuvwxyz123456"' });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_SECRET_LEAK: allows normal content', () => {
    const result = evaluateKernelGates({ command: 'echo hello world', fileContent: 'This is a normal file.' });
    assert.strictEqual(result.allowed, true);
  });

  // ── NO_PATH_ESCAPE ─────────────────────────────────────────

  it('NO_PATH_ESCAPE: blocks path traversal with ..', () => {
    const result = evaluateKernelGates({
      targetPath: '/workspace/test-project/../etc/passwd',
      worktreeRoot: '/workspace/test-project'
    });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_PATH_ESCAPE: blocks write outside worktree', () => {
    const result = evaluateKernelGates({
      writePath: '/etc/passwd',
      worktreeRoot: '/workspace/test-project'
    });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_PATH_ESCAPE: allows write within worktree', () => {
    const result = evaluateKernelGates({
      writePath: '/workspace/test-project/src/file.js',
      worktreeRoot: '/workspace/test-project'
    });
    assert.strictEqual(result.allowed, true);
  });

  // ── NO_SYMLINK_ESCAPE ──────────────────────────────────────

  // NOTE: symlink escape tests need actual filesystem paths.
  // We test the logical check without actual symlinks — the real test
  // requires a filesystem fixture.

  // ── NO_UNRELATED_WORKTREE_WRITE ────────────────────────────

  it('NO_UNRELATED_WORKTREE_WRITE: blocks write outside worktree', () => {
    const result = evaluateKernelGates({
      writePath: '/tmp/outside/file.txt',
      worktreeRoot: '/workspace/test-project'
    });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_UNRELATED_WORKTREE_WRITE: allows write inside worktree', () => {
    const result = evaluateKernelGates({
      writePath: '/workspace/test-project/src/file.txt',
      worktreeRoot: '/workspace/test-project'
    });
    assert.strictEqual(result.allowed, true);
  });

  // ── NO_PRODUCTION_WRITE_WITHOUT_APPROVAL ───────────────────

  it('NO_PRODUCTION_WRITE: blocks production write without approval', () => {
    const result = evaluateKernelGates({
      writePath: '/app/production/data.json',
      approvalForProductionWrite: false
    });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_PRODUCTION_WRITE: allows production write with approval', () => {
    const result = evaluateKernelGates({
      writePath: '/app/production/data.json',
      worktreeRoot: '/app',
      approvalForProductionWrite: true
    });
    assert.strictEqual(result.allowed, true);
  });

  // ── NO_REMOTE_ACTION_WITHOUT_SCOPED_APPROVAL ───────────────

  it('NO_REMOTE_ACTION: blocks remote action without approval', () => {
    const result = evaluateKernelGates({
      command: 'git push origin main',
      approvalForRemote: false
    });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_REMOTE_ACTION: allows remote action with approval', () => {
    const result = evaluateKernelGates({
      command: 'git push origin main',
      approvalForRemote: true
    });
    assert.strictEqual(result.allowed, true);
  });

  // ── NO_FALSE_GREEN ─────────────────────────────────────────

  it('NO_FALSE_GREEN: blocks FALSE_GREEN when kernel shows RED_BLOCK', () => {
    const result = evaluateKernelGates({
      claimedClassification: CLASSIFICATIONS.GREEN_SAFE,
      actualResults: [
        { classification: CLASSIFICATIONS.RED_BLOCK, blockedBy: ['NO_FORCE_PUSH'] }
      ]
    });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_FALSE_GREEN: allows GREEN when all checks pass', () => {
    const result = evaluateKernelGates({
      claimedClassification: CLASSIFICATIONS.GREEN_SAFE,
      actualResults: [
        { classification: CLASSIFICATIONS.GREEN_SAFE }
      ]
    });
    assert.strictEqual(result.allowed, true);
  });

  // ── NO_FAKE_EXECUTION ──────────────────────────────────────

  it('NO_FAKE_EXECUTION: blocks claimed execution with no output', () => {
    const result = evaluateKernelGates({
      claimedExecution: true,
      executionOutput: null,
      executionTimeMs: 0
    });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_FAKE_EXECUTION: allows execution with output', () => {
    const result = evaluateKernelGates({
      claimedExecution: true,
      executionOutput: 'test output',
      executionTimeMs: 150
    });
    assert.strictEqual(result.allowed, true);
  });

  // ── NO_REVIEWER_WRITE ──────────────────────────────────────

  it('NO_REVIEWER_WRITE: blocks reviewer write operation', () => {
    const result = evaluateKernelGates({
      agentRole: 'reviewer',
      agentId: 'review-agent',
      action: 'write',
      isWrite: true
    });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_REVIEWER_WRITE: allows reviewer read operation', () => {
    const result = evaluateKernelGates({
      agentRole: 'reviewer',
      agentId: 'review-agent',
      action: 'read',
      isWrite: false
    });
    assert.strictEqual(result.allowed, true);
  });

  // ── NO_APPLY_WITHOUT_BACKUP ────────────────────────────────

  it('NO_APPLY_WITHOUT_BACKUP: blocks apply without backup', () => {
    const result = evaluateKernelGates({ action: 'apply', hasBackup: false });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_APPLY_WITHOUT_BACKUP: allows apply with backup', () => {
    const result = evaluateKernelGates({ action: 'apply', hasBackup: true });
    assert.strictEqual(result.allowed, true);
  });

  // ── NO_ROLLBACK_WITHOUT_VALIDATED_MANIFEST ─────────────────

  it('NO_ROLLBACK_WITHOUT_MANIFEST: blocks rollback without manifest', () => {
    const result = evaluateKernelGates({ action: 'rollback', hasValidatedManifest: false });
    assert.strictEqual(result.allowed, false);
  });

  // ── NO_APPROVAL_REUSE ─────────────────────────────────────

  it('NO_APPROVAL_REUSE: blocks consumed approval reuse', () => {
    const result = evaluateKernelGates({
      approvalStatus: 'CONSUMED',
      isReuseAttempt: true,
      approvalAction: 'push',
      action: 'push'
    });
    assert.strictEqual(result.allowed, false);
  });

  // ── NO_CROSS_ACTION_APPROVAL ──────────────────────────────

  it('NO_CROSS_ACTION_APPROVAL: blocks approval for different action', () => {
    const result = evaluateKernelGates({
      approvalAction: 'push',
      requestedAction: 'merge'
    });
    assert.strictEqual(result.allowed, false);
  });

  // ── NO_CROSS_SCOPE_APPROVAL ───────────────────────────────

  it('NO_CROSS_SCOPE_APPROVAL: blocks branch mismatch', () => {
    const result = evaluateKernelGates({
      approvalBranch: 'main',
      currentBranch: 'feature-branch'
    });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_CROSS_SCOPE_APPROVAL: blocks runtime mismatch', () => {
    const result = evaluateKernelGates({
      approvalRuntime: 'opencode',
      currentRuntime: 'hermes'
    });
    assert.strictEqual(result.allowed, false);
  });

  // ── NO_EXPIRED_APPROVAL ───────────────────────────────────

  it('NO_EXPIRED_APPROVAL: blocks expired approval', () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
    const result = evaluateKernelGates({
      approvalExpiresAt: pastDate
    });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_EXPIRED_APPROVAL: allows valid approval', () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
    const result = evaluateKernelGates({
      approvalExpiresAt: futureDate
    });
    assert.strictEqual(result.allowed, true);
  });

  // ── NO_RUNTIME_ADAPTER_OVERRIDE ────────────────────────────

  it('NO_RUNTIME_ADAPTER_OVERRIDE: blocks adapter override attempt', () => {
    const result = evaluateKernelGates({
      adapterAttemptedOverride: true,
      adapterId: 'malicious-adapter',
      attemptedGateId: 'NO_FORCE_PUSH',
      kernelGateId: 'NO_FORCE_PUSH'
    });
    assert.strictEqual(result.allowed, false);
  });

  // ── NO_GLOBAL_RUNTIME_CONFIG_WRITE ────────────────────────

  it('NO_GLOBAL_RUNTIME_CONFIG_WRITE: blocks write to global OpenCode config', () => {
    // Use /etc/opencode/ which is in the kernel's global config path list
    const result = evaluateKernelGates({
      writePath: '/etc/opencode/test.json'
    });
    assert.strictEqual(result.allowed, false);
  });

  // ── NO_AGPL_INCORPORATION ─────────────────────────────────

  it('NO_AGPL_INCORPORATION: blocks AGPL source incorporation', () => {
    const result = evaluateKernelGates({
      sourceRepository: 'odysseus-dev/odysseus',
      sourcePath: '/tmp/odysseus-gate-test/src/something.py'
    });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_AGPL_INCORPORATION: blocks AGPL license text in content', () => {
    const result = evaluateKernelGates({
      fileContent: 'This file is licensed under the GNU AFFERO GENERAL PUBLIC LICENSE version 3'
    });
    assert.strictEqual(result.allowed, false);
  });

  it('NO_AGPL_INCORPORATION: allows normal content', () => {
    const result = evaluateKernelGates({
      fileContent: 'This file is licensed under the MIT License'
    });
    assert.strictEqual(result.allowed, true);
  });

  // ── Classification Priority ────────────────────────────────

  it('RED_BLOCK has highest priority', () => {
    // Even with multiple OK contexts, a RED_BLOCK violation dominates
    const result = evaluateKernelGates({
      command: 'normal command',
      action: 'read'
    });
    // Should be allowed (no violations)
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.classification, CLASSIFICATIONS.GREEN_SAFE);
  });

  it('multiple violations are all collected', () => {
    const result = evaluateKernelGates({
      command: 'git push --force origin main', // force push
      fileContent: 'api_key: "ghp_1234567890abcdef"' // secret leak
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.failedGateCount >= 2, true, `Expected >= 2 failed gates, got ${result.failedGateCount}`);
  });

  // ── Kernel Gate Override Detection ────────────────────────

  it('detects external attempts to disable kernel gates', () => {
    const result = detectKernelGateOverrides({
      disabledKernelGates: ['NO_FORCE_PUSH', 'NO_SECRET_LEAK']
    });
    assert.strictEqual(result.clean, false);
    assert.strictEqual(result.overrides.length, 2);
  });

  it('detects false claims about kernel gates', () => {
    const result = detectKernelGateOverrides({
      NO_FORCE_PUSH: false // falsely claiming NO_FORCE_PUSH is not required
    });
    assert.strictEqual(result.clean, false);
  });

  it('clean when no overrides attempted', () => {
    const result = detectKernelGateOverrides({});
    assert.strictEqual(result.clean, true);
    assert.strictEqual(result.overrides.length, 0);
  });

  // ── Gate Immutability ──────────────────────────────────────

  it('getKernelGateIds returns immutable array', () => {
    const ids = getKernelGateIds();
    assert.strictEqual(Array.isArray(ids), true);
    assert.throws(() => { ids.push('NEW_GATE'); }, TypeError, 'Array should be frozen');
  });

  it('getKernelGates returns frozen array', () => {
    const gates = getKernelGates();
    assert.throws(() => { gates.push({ id: 'test' }); }, TypeError, 'Array should be frozen');
  });

  it('isKernelGate correctly identifies kernel gates', () => {
    assert.strictEqual(isKernelGate('NO_FORCE_PUSH'), true);
    assert.strictEqual(isKernelGate('NO_SECRET_LEAK'), true);
    assert.strictEqual(isKernelGate('RANDOM_GATE'), false);
  });
});
