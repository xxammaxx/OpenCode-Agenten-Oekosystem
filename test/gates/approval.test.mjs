/**
 * Approval Receipt Tests
 *
 * Validates:
 * - Receipt creation and lifecycle
 * - Single-use enforcement
 * - Cross-action protection
 * - Cross-scope protection
 * - Expiry enforcement
 * - Fingerprint validation
 * - Secret-free receipts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createApprovalReceipt,
  approveReceipt,
  denyReceipt,
  consumeReceipt,
  isExpired,
  validateReceiptStructure,
  markNonceConsumed,
  isNonceConsumed,
  areActionsMutuallyExclusive,
  APPROVAL_STATUSES,
  VALID_ACTIONS
} from '../../scripts/lib/gates/approval.mjs';
import {
  ApprovalReuseViolation,
  CrossActionApprovalViolation,
  CrossScopeApprovalViolation,
  ExpiredApprovalViolation
} from '../../scripts/lib/gates/errors.mjs';

describe('Approval Receipts', () => {

  // ── Creation ───────────────────────────────────────────────

  it('creates a valid receipt with all required fields', () => {
    const receipt = createApprovalReceipt({
      action: 'push',
      runtime: 'opencode',
      targetRoot: '/tmp/test-project',
      gitBranch: 'main',
      gitCommit: 'abc123',
      riskTier: 'MEDIUM_REVIEW',
      scopePaths: ['src/', 'test/']
    });

    assert.strictEqual(receipt.version, '1.0.0');
    assert.strictEqual(receipt.action, 'push');
    assert.strictEqual(receipt.runtime, 'opencode');
    assert.strictEqual(receipt.scope.branch, 'main');
    assert.strictEqual(receipt.singleUse, true);
    assert.strictEqual(receipt.status, APPROVAL_STATUSES.NOT_REQUESTED);
    assert.ok(receipt.nonce, 'Nonce must be present');
    assert.ok(receipt.contextFingerprint, 'Fingerprint must be present');
    assert.ok(receipt.expiresAt, 'Expiry must be present');
  });

  it('validates action is in VALID_ACTIONS', () => {
    assert.throws(() => {
      createApprovalReceipt({
        action: 'invalid_action',
        runtime: 'opencode',
        targetRoot: '/tmp/test'
      });
    }, /Invalid action/);
  });

  // ── Lifecycle ──────────────────────────────────────────────

  it('approves a PENDING receipt', () => {
    const receipt = createApprovalReceipt({
      action: 'push',
      runtime: 'opencode',
      targetRoot: '/tmp/test',
      gitBranch: 'main',
      gitCommit: 'abc'
    });

    // First make it PENDING (NOT_REQUESTED → PENDING)
    const pending = { ...receipt, status: APPROVAL_STATUSES.PENDING };
    const approved = approveReceipt(pending, 'owner');
    assert.strictEqual(approved.status, APPROVAL_STATUSES.APPROVED);
    assert.strictEqual(approved.approvedBy, 'owner');
    assert.ok(approved.approvedAt);
  });

  it('denies a receipt', () => {
    const receipt = { ...createApprovalReceipt({
      action: 'push', runtime: 'opencode', targetRoot: '/tmp/test',
      gitBranch: 'main', gitCommit: 'abc'
    }), status: APPROVAL_STATUSES.PENDING };

    const denied = denyReceipt(receipt);
    assert.strictEqual(denied.status, APPROVAL_STATUSES.DENIED);
  });

  it('consumes an APPROVED receipt', () => {
    const now = Date.now();
    const receipt = {
      ...createApprovalReceipt({
        action: 'push', runtime: 'opencode', targetRoot: '/tmp/test',
        gitBranch: 'main', gitCommit: 'abc'
      }),
      status: APPROVAL_STATUSES.APPROVED,
      expiresAt: new Date(now + 3600000).toISOString()
    };

    const contextFingerprint = receipt.contextFingerprint;
    const consumed = consumeReceipt(receipt, {
      action: 'push',
      gitBranch: 'main',
      fingerprint: contextFingerprint
    });
    assert.strictEqual(consumed.status, APPROVAL_STATUSES.CONSUMED);
    assert.ok(consumed.consumedAt);
  });

  // ── Single-Use Enforcement ─────────────────────────────────

  it('prevents reuse of CONSUMED receipt', () => {
    const now = Date.now();
    const receipt = {
      ...createApprovalReceipt({
        action: 'push', runtime: 'opencode', targetRoot: '/tmp/test',
        gitBranch: 'main', gitCommit: 'abc'
      }),
      status: APPROVAL_STATUSES.CONSUMED,
      expiresAt: new Date(now + 3600000).toISOString()
    };

    assert.throws(() => {
      consumeReceipt(receipt, { action: 'push', gitBranch: 'main' });
    }, /reuse|blocked/i);
  });

  // ── Cross-Action Protection ────────────────────────────────

  it('blocks push-approval used for merge', () => {
    const now = Date.now();
    const receipt = {
      ...createApprovalReceipt({
        action: 'push', runtime: 'opencode', targetRoot: '/tmp/test',
        gitBranch: 'main', gitCommit: 'abc'
      }),
      status: APPROVAL_STATUSES.APPROVED,
      expiresAt: new Date(now + 3600000).toISOString()
    };

    assert.throws(() => {
      consumeReceipt(receipt, { action: 'merge', gitBranch: 'main' });
    }, /cross.*action|different action/i);
  });

  it('confirms push and merge are mutually exclusive', () => {
    assert.strictEqual(areActionsMutuallyExclusive('push', 'merge'), true);
    assert.strictEqual(areActionsMutuallyExclusive('push', 'push'), false);
  });

  // ── Cross-Scope Protection ─────────────────────────────────

  it('blocks branch mismatch', () => {
    const now = Date.now();
    const receipt = {
      ...createApprovalReceipt({
        action: 'push', runtime: 'opencode', targetRoot: '/tmp/test',
        gitBranch: 'main', gitCommit: 'abc'
      }),
      status: APPROVAL_STATUSES.APPROVED,
      expiresAt: new Date(now + 3600000).toISOString()
    };

    assert.throws(() => {
      consumeReceipt(receipt, { action: 'push', gitBranch: 'feature-x' });
    }, /branch/i);
  });

  it('blocks runtime mismatch', () => {
    const now = Date.now();
    const receipt = {
      ...createApprovalReceipt({
        action: 'push', runtime: 'opencode', targetRoot: '/tmp/test',
        gitBranch: 'main', gitCommit: 'abc'
      }),
      status: APPROVAL_STATUSES.APPROVED,
      expiresAt: new Date(now + 3600000).toISOString()
    };

    assert.throws(() => {
      consumeReceipt(receipt, { action: 'push', gitBranch: 'main', runtime: 'hermes' });
    }, /scope|runtime|mismatch/i);
  });

  // ── Expiry ─────────────────────────────────────────────────

  it('blocks expired receipt', () => {
    const past = new Date(Date.now() - 3600000).toISOString();
    const receipt = {
      ...createApprovalReceipt({
        action: 'push', runtime: 'opencode', targetRoot: '/tmp/test',
        gitBranch: 'main', gitCommit: 'abc'
      }),
      status: APPROVAL_STATUSES.APPROVED,
      expiresAt: past
    };

    assert.strictEqual(isExpired(receipt), true);
    assert.throws(() => {
      consumeReceipt(receipt, { action: 'push', gitBranch: 'main' });
    }, /expired/i);
  });

  // ── Structural Validation ──────────────────────────────────

  it('detects invalid receipt structure', () => {
    const issues = validateReceiptStructure({});
    assert.ok(issues.length > 0, 'Empty object should produce issues');
  });

  it('detects missing nonce', () => {
    const receipt = {
      version: '1.0.0',
      action: 'push',
      runtime: 'opencode',
      scope: { branch: 'main', paths: [] },
      contextFingerprint: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      status: APPROVAL_STATUSES.APPROVED
      // missing nonce
    };
    const issues = validateReceiptStructure(receipt);
    assert.ok(issues.some(i => i.field === 'nonce'));
  });

  it('accepts valid receipt', () => {
    const receipt = createApprovalReceipt({
      action: 'push', runtime: 'opencode', targetRoot: '/tmp/test',
      gitBranch: 'main', gitCommit: 'abc'
    });
    const issues = validateReceiptStructure({ ...receipt, status: APPROVAL_STATUSES.APPROVED });
    assert.strictEqual(issues.length, 0, `Expected no issues, got: ${JSON.stringify(issues)}`);
  });

  // ── Secret-Free Receipts ───────────────────────────────────

  it('detects potential secrets in receipt', () => {
    const receipt = createApprovalReceipt({
      action: 'push', runtime: 'opencode', targetRoot: '/tmp/test',
      gitBranch: 'main', gitCommit: 'abc'
    });
    // Inject a secret-like field
    const tainted = { ...receipt, apiKey: 'sk-secret-12345' };
    const issues = validateReceiptStructure(tainted);
    assert.ok(issues.some(i => i.field === 'content' && i.issue === 'POTENTIAL_SECRET_IN_RECEIPT'));
  });

  // ── Nonce Ledger ───────────────────────────────────────────

  it('nonce ledger tracks consumed nonces', () => {
    const nonce = 'test-nonce-' + Date.now();
    assert.strictEqual(isNonceConsumed(nonce), false);
    markNonceConsumed(nonce);
    assert.strictEqual(isNonceConsumed(nonce), true);
  });

  // ── Expiry Capping ─────────────────────────────────────────

  it('caps expiry at maximum 24 hours', () => {
    const receipt = createApprovalReceipt({
      action: 'push', runtime: 'opencode', targetRoot: '/tmp/test',
      gitBranch: 'main', gitCommit: 'abc',
      expiresInMs: 48 * 60 * 60 * 1000 // 48 hours
    });
    const expiryDate = new Date(receipt.expiresAt).getTime();
    const maxDate = Date.now() + 24 * 60 * 60 * 1000;
    assert.ok(expiryDate <= maxDate + 1000, 'Expiry should be capped at 24 hours');
  });

  // ── VALID_ACTIONS ──────────────────────────────────────────

  it('VALID_ACTIONS includes expected actions', () => {
    for (const action of ['push', 'apply', 'merge', 'deploy', 'skill_write', 'memory_write', 'shell_write', 'ssh_write', 'email_send', 'calendar_write', 'model_download', 'docker_socket']) {
      assert.ok(VALID_ACTIONS.includes(action), `VALID_ACTIONS should include "${action}"`);
    }
  });
});
