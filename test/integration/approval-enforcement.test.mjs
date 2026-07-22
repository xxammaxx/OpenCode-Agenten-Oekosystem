/**
 * Approval Enforcement Integration Tests
 *
 * Validates:
 * - Create receipt, approve, consume in gate evaluation
 * - Consumed receipt cannot be reused
 * - Expired receipt is rejected
 * - Cross-action receipt blocked
 * - Cross-branch receipt blocked
 * - Nonce ledger works
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  createApprovalReceipt,
  approveReceipt as rawApproveReceipt,
  consumeReceipt as rawConsumeReceipt,
  computeReceiptIntegrity,
  isExpired,
  isNonceConsumed,
  markNonceConsumed,
  APPROVAL_STATUSES,
  VALID_ACTIONS
} from '../../scripts/lib/gates/approval.mjs';
import {
  ApprovalReuseViolation,
  CrossActionApprovalViolation,
  CrossScopeApprovalViolation,
  ExpiredApprovalViolation
} from '../../scripts/lib/gates/errors.mjs';
import { repoRoot } from '../helpers.mjs';

const TEST_HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function approveReceipt(receipt, approvedBy) {
  const pending = { ...receipt, status: APPROVAL_STATUSES.PENDING, integrity_hash: null };
  pending.integrity_hash = computeReceiptIntegrity(pending);
  return rawApproveReceipt(pending, approvedBy);
}

function consumeReceipt(receipt, context = {}) {
  const normalized = { ...receipt, integrity_hash: null };
  if (normalized.expiresAt && normalized.expiresAt !== normalized.expires_at) normalized.expires_at = normalized.expiresAt;
  normalized.integrity_hash = computeReceiptIntegrity(normalized);
  return rawConsumeReceipt(normalized, {
    project_path: normalized.project_path,
    repository_identity: normalized.repository_identity,
    branch: context.gitBranch || context.branch || normalized.branch,
    head: context.gitCommit || context.head || normalized.head,
    phase: context.phase || normalized.phase,
    action: context.action || normalized.action,
    runtime: context.runtime || normalized.runtime,
    risk_tier: context.riskTier || context.risk_tier || normalized.risk_tier,
    scope: context.scope || normalized.scope,
    allowMissingProject: true,
    baseDir: process.cwd(),
    ...context
  });
}

const GATE_CLI = path.join(repoRoot, 'scripts', 'evaluate-gates.mjs');

function runGateCli(args) {
  return spawnSync(process.execPath, [GATE_CLI, ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 10 * 1024 * 1024,
    cwd: repoRoot,
  });
}

describe('Approval Enforcement', () => {
  const tempDirs = [];

  after(async () => {
    for (const dir of tempDirs) {
      try { await fs.rm(dir, { recursive: true, force: true }); } catch { /* ok */ }
    }
  });

  // ── Create, approve, consume ────────────────────────────────

  it('create → approve → consume lifecycle works', () => {
    const receipt = createApprovalReceipt({
      action: 'push',
      runtime: 'opencode',
      targetRoot: '/tmp/test-project',
      gitBranch: 'main',
      gitCommit: TEST_HEAD,
      riskTier: 'MEDIUM_REVIEW',
      scopePaths: ['src/', 'test/']
    });

    assert.strictEqual(receipt.status, APPROVAL_STATUSES.NOT_REQUESTED);
    assert.ok(receipt.nonce, 'Nonce should be present');
    assert.ok(receipt.singleUse, 'Should be single-use');
    assert.strictEqual(receipt.version, '1.0.0');

    // Transition to PENDING then APPROVED
    const pending = { ...receipt, status: APPROVAL_STATUSES.PENDING };
    const approved = approveReceipt(pending, 'owner');

    assert.strictEqual(approved.status, APPROVAL_STATUSES.APPROVED);
    assert.strictEqual(approved.approvedBy, 'owner');
    assert.ok(approved.approvedAt, 'Should have approvedAt timestamp');

    // Consume
    const consumed = consumeReceipt(approved, {
      action: 'push',
      gitBranch: 'main',
      fingerprint: receipt.contextFingerprint
    });

    assert.strictEqual(consumed.status, APPROVAL_STATUSES.CONSUMED);
    assert.ok(consumed.consumedAt, 'Should have consumedAt timestamp');
  });

  // ── Consumed receipt cannot be reused ───────────────────────

  it('CONSUMED receipt cannot be reused', () => {
    const receipt = createApprovalReceipt({
      action: 'push',
      runtime: 'opencode',
      targetRoot: `/tmp/test-reuse-${Date.now()}`,
      gitBranch: 'main',
      gitCommit: TEST_HEAD
    });

    const pending = { ...receipt, status: APPROVAL_STATUSES.PENDING };
    const approved = approveReceipt(pending, 'owner');
    const consumed = consumeReceipt(approved, {
      action: 'push',
      gitBranch: 'main',
      fingerprint: receipt.contextFingerprint
    });

    assert.strictEqual(consumed.status, APPROVAL_STATUSES.CONSUMED);

    // Try to reuse
    assert.throws(() => {
      consumeReceipt(consumed, {
        action: 'push',
        gitBranch: 'main',
        fingerprint: receipt.contextFingerprint
      });
    }, /reuse|blocked|CONSUMED/i);
  });

  // ── Expired receipt is rejected ─────────────────────────────

  it('EXPIRED receipt is rejected', () => {
    const receipt = createApprovalReceipt({
      action: 'push',
      runtime: 'opencode',
      targetRoot: '/tmp/test-expired',
      gitBranch: 'main',
      gitCommit: TEST_HEAD,
      expiresInMs: -1 // ensure past (avoids Date.now()==expiresAt race)
    });

    assert.strictEqual(isExpired(receipt), true);

    const approved = { ...receipt, status: APPROVAL_STATUSES.APPROVED };

    assert.throws(() => {
      consumeReceipt(approved, {
        action: 'push',
        gitBranch: 'main',
        fingerprint: receipt.contextFingerprint
      });
    }, /expired/i);
  });

  // ── Cross-action receipt blocked ───────────────────────────

  it('push-approval blocked for merge', () => {
    const receipt = createApprovalReceipt({
      action: 'push',
      runtime: 'opencode',
      targetRoot: '/tmp/test-cross-action',
      gitBranch: 'main',
      gitCommit: TEST_HEAD
    });

    const pending = { ...receipt, status: APPROVAL_STATUSES.PENDING };
    const approved = approveReceipt(pending, 'owner');

    assert.throws(() => {
      consumeReceipt(approved, {
        action: 'merge',
        gitBranch: 'main',
        fingerprint: receipt.contextFingerprint
      });
    }, /cross.*action|different action/i);
  });

  // ── Cross-branch receipt blocked ───────────────────────────

  it('main-branch approval blocked for feature-branch', () => {
    const receipt = createApprovalReceipt({
      action: 'push',
      runtime: 'opencode',
      targetRoot: '/tmp/test-cross-branch',
      gitBranch: 'main',
      gitCommit: TEST_HEAD
    });

    const pending = { ...receipt, status: APPROVAL_STATUSES.PENDING };
    const approved = approveReceipt(pending, 'owner');

    assert.throws(() => {
      consumeReceipt(approved, {
        action: 'push',
        gitBranch: 'feature-x',
        fingerprint: receipt.contextFingerprint
      });
    }, /branch/i);
  });

  // ── Nonce ledger works ─────────────────────────────────────

  it('nonce ledger prevents replay in same process', () => {
    const receipt = createApprovalReceipt({
      action: 'push',
      runtime: 'opencode',
      targetRoot: `/tmp/test-nonce-${Date.now()}`,
      gitBranch: 'main',
      gitCommit: TEST_HEAD
    });

    const nonce = receipt.nonce;
    assert.strictEqual(isNonceConsumed(nonce), false);

    // Consume via ledger
    markNonceConsumed(nonce);
    assert.strictEqual(isNonceConsumed(nonce), true);
  });

  it('nonce ledger blocks second consume attempt', () => {
    const receipt = createApprovalReceipt({
      action: 'push',
      runtime: 'opencode',
      targetRoot: `/tmp/test-nonce2-${Date.now()}`,
      gitBranch: 'main',
      gitCommit: TEST_HEAD
    });

    const pending = { ...receipt, status: APPROVAL_STATUSES.PENDING };
    const approved = approveReceipt(pending, 'owner');

    // First consume
    consumeReceipt(approved, {
      action: 'push',
      gitBranch: 'main',
      fingerprint: receipt.contextFingerprint
    });

    assert.strictEqual(isNonceConsumed(receipt.nonce), true);

    // Create a fresh receipt (same nonce impossible since UUID, but test the ledger)
    const receipt2 = createApprovalReceipt({
      action: 'push',
      runtime: 'opencode',
      targetRoot: `/tmp/test-nonce3-${Date.now()}`,
      gitBranch: 'main',
      gitCommit: TEST_HEAD
    });

    // Mark its nonce consumed in ledger
    markNonceConsumed(receipt2.nonce);

    // Any attempt to consume should see the ledger check (first-line defense in consumeReceipt)
    const pending2 = { ...receipt2, status: APPROVAL_STATUSES.PENDING };
    const approved2 = approveReceipt(pending2, 'owner');

    assert.throws(() => {
      consumeReceipt(approved2, { action: 'push', gitBranch: 'main' });
    }, /reuse|blocked/i);
  });

  // ── Runtime mismatch blocked ───────────────────────────────

  it('opencode approval blocked for hermes runtime', () => {
    const receipt = createApprovalReceipt({
      action: 'push',
      runtime: 'opencode',
      targetRoot: '/tmp/test-runtime-mismatch',
      gitBranch: 'main',
      gitCommit: TEST_HEAD
    });

    const pending = { ...receipt, status: APPROVAL_STATUSES.PENDING };
    const approved = approveReceipt(pending, 'owner');

    assert.throws(() => {
      consumeReceipt(approved, {
        action: 'push',
        gitBranch: 'main',
        runtime: 'hermes',
        fingerprint: receipt.contextFingerprint
      });
    }, /scope|runtime|mismatch/i);
  });

  // ── Denied receipt cannot be consumed ──────────────────────

  it('DENIED receipt cannot be consumed', () => {
    const receipt = createApprovalReceipt({
      action: 'push',
      runtime: 'opencode',
      targetRoot: '/tmp/test-denied',
      gitBranch: 'main',
      gitCommit: TEST_HEAD
    });

    const pending = { ...receipt, status: APPROVAL_STATUSES.PENDING };
    const denied = { ...pending, status: APPROVAL_STATUSES.DENIED };

    assert.throws(() => {
      consumeReceipt(denied, {
        action: 'push',
        gitBranch: 'main',
        fingerprint: receipt.contextFingerprint
      });
    });
  });

  // ── Receipt expiry capped at 24 hours ──────────────────────

  it('expiry is capped at 24 hours', () => {
    const receipt = createApprovalReceipt({
      action: 'push',
      runtime: 'opencode',
      targetRoot: '/tmp/test-expiry-cap',
      gitBranch: 'main',
      gitCommit: TEST_HEAD,
      expiresInMs: 48 * 60 * 60 * 1000 // 48 hours
    });
    const expiryDate = new Date(receipt.expiresAt).getTime();
    const maxDate = Date.now() + 24 * 60 * 60 * 1000;
    assert.ok(expiryDate <= maxDate + 1000,
      'Expiry should be capped at 24 hours');
  });

  // ── VALID_ACTIONS includes expected entries ────────────────

  it('VALID_ACTIONS covers the expected governance actions', () => {
    for (const action of ['push', 'apply', 'merge', 'deploy', 'skill_write', 'memory_write']) {
      assert.ok(VALID_ACTIONS.includes(action),
        `VALID_ACTIONS should include "${action}"`);
    }
  });
});
