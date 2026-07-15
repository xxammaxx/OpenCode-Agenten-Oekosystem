/**
 * Approval Receipt Model
 *
 * Scope-bound, single-use, cryptographically nonced approval receipts.
 * Every receipt is:
 * - Bound to a specific action, runtime, repository, branch, and paths
 * - Single-use (nonce prevents replay)
 * - Time-limited (expires_at)
 * - Context-fingerprinted (fingerprint invalidates on scope change)
 *
 * Key security properties:
 * - Push-approval ≠ Merge-approval (cross-action protection)
 * - Branch-mismatch invalidates (cross-scope protection)
 * - Expired receipts are rejected (temporal boundary)
 * - Consumed receipts cannot be reused (nonce ledger)
 * - Approval files MUST NOT contain secrets
 */

import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { generateContextFingerprint, isValidFingerprintFormat } from './context-fingerprint.mjs';
import {
  ApprovalReuseViolation,
  CrossActionApprovalViolation,
  CrossScopeApprovalViolation,
  ExpiredApprovalViolation
} from './errors.mjs';

// ── Constants ─────────────────────────────────────────────────────

/** Valid approval statuses */
const STATUS = Object.freeze({
  NOT_REQUESTED: 'NOT_REQUESTED',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
  EXPIRED: 'EXPIRED',
  CONSUMED: 'CONSUMED'
});

/** Status transitions allowed */
const VALID_TRANSITIONS = Object.freeze({
  [STATUS.NOT_REQUESTED]: new Set([STATUS.PENDING]),
  [STATUS.PENDING]: new Set([STATUS.APPROVED, STATUS.DENIED, STATUS.EXPIRED]),
  [STATUS.APPROVED]: new Set([STATUS.CONSUMED, STATUS.EXPIRED]),
  [STATUS.DENIED]: new Set([]), // terminal
  [STATUS.EXPIRED]: new Set([]), // terminal
  [STATUS.CONSUMED]: new Set([]) // terminal
});

/** Valid actions that can be approved */
const VALID_ACTIONS = Object.freeze([
  'apply',
  'commit',
  'push',
  'pr',
  'merge',
  'deploy',
  'remote_ci',
  'skill_write',
  'memory_write',
  'mcp_tier_2',
  'shell_write',
  'ssh_write',
  'email_send',
  'calendar_write',
  'model_download',
  'docker_socket',
  'email_read',
  'calendar_read'
]);

/** Default approval expiry: 1 hour */
const DEFAULT_EXPIRY_MS = 60 * 60 * 1000;

/** Maximum approval expiry: 24 hours (hard-coded kernel limit) */
const MAX_EXPIRY_MS = 24 * 60 * 60 * 1000;

// ── Receipt Schema ────────────────────────────────────────────────

/**
 * Create a new approval receipt (NOT_REQUESTED or PENDING).
 *
 * CHANGING SCOPE INVALIDATES THE RECEIPT.
 * The context_fingerprint captures: repository root, branch, commit,
 * action, runtime, risk tier, scope paths, and policy checksums.
 * Any change to these produces a different fingerprint → receipt invalid.
 */
export function createApprovalReceipt({
  action,
  runtime,
  targetRoot,
  gitBranch = 'unknown',
  gitCommit = 'unknown',
  riskTier = 'MEDIUM_REVIEW',
  scopePaths = [],
  policyFile = null,
  expiresInMs = DEFAULT_EXPIRY_MS
}) {
  // Validate action
  if (!VALID_ACTIONS.includes(action)) {
    throw new Error(`Invalid action: "${action}". Valid actions: ${VALID_ACTIONS.join(', ')}`);
  }

  // Cap expiry at kernel maximum
  const actualExpiry = Math.min(expiresInMs, MAX_EXPIRY_MS);

  const approvedBy = null;
  const approvedAt = null;
  const expiresAt = new Date(Date.now() + actualExpiry).toISOString();
  const nonce = randomUUID();
  const status = STATUS.NOT_REQUESTED;

  // Generate context fingerprint (NO PII)
  const contextFingerprint = generateContextFingerprint({
    targetRoot,
    gitBranch,
    gitCommit,
    action,
    runtime,
    riskTier,
    scopePaths,
    policyFile
  });

  return deepFreezeReceipt({
    version: '1.0.0',
    action,
    runtime,
    scope: {
      repository: extractRepoName(targetRoot),
      branch: gitBranch,
      commit: gitCommit,
      paths: [...scopePaths],
      targetRoot: targetRoot.split('/').slice(-2).join('/') // redacted
    },
    riskTier,
    contextFingerprint,
    approvedBy,
    approvedAt,
    expiresAt,
    singleUse: true,
    nonce,
    status
  });
}

/**
 * Approve a receipt that is in PENDING status.
 * Returns a NEW receipt object — does not mutate the input.
 */
export function approveReceipt(receipt, approvedBy) {
  validateTransition(receipt, STATUS.APPROVED);

  const updated = {
    ...receipt,
    status: STATUS.APPROVED,
    approvedBy,
    approvedAt: new Date().toISOString(),
    scope: { ...receipt.scope },
    expiresAt: receipt.expiresAt // preserve original expiry
  };

  return deepFreezeReceipt(updated);
}

/**
 * Deny a receipt.
 */
export function denyReceipt(receipt) {
  validateTransition(receipt, STATUS.DENIED);
  return deepFreezeReceipt({ ...receipt, status: STATUS.DENIED });
}

/**
 * Consume a receipt (mark as single-use consumed).
 * This prevents replay — consumed receipts can never be used again.
 *
 * @throws {ApprovalReuseViolation} if already consumed
 * @throws {ExpiredApprovalViolation} if expired
 * @throws {CrossActionApprovalViolation} if action mismatch
 * @throws {CrossScopeApprovalViolation} if scope mismatch
 */
export function consumeReceipt(receipt, currentContext = {}) {
  // ── Nonce-Ledger First-Line Defense (prevents replay across references) ──
  // This check catches replay even if the receipt object still shows APPROVED
  // (since deepFreezeReceipt creates immutable copies, the original reference
  // retains its APPROVED status after the first consumption).
  if (isNonceConsumed(receipt.nonce)) {
    // Also check the filesystem ledger for cross-process detection
    const ledgerEntry = readReceiptFromLedger(receipt.nonce, currentContext.baseDir);
    const consumedAt = ledgerEntry?.consumedAt || 'unknown';
    throw new ApprovalReuseViolation({
      evidence: {
        nonce: receipt.nonce,
        action: receipt.action,
        consumedAt
      }
    });
  }

  // Check status
  if (receipt.status === STATUS.CONSUMED) {
    throw new ApprovalReuseViolation({
      evidence: {
        nonce: receipt.nonce,
        action: receipt.action,
        consumedAt: receipt.consumedAt || 'unknown'
      }
    });
  }

  if (receipt.status === STATUS.EXPIRED) {
    throw new ExpiredApprovalViolation({
      evidence: { nonce: receipt.nonce, expiresAt: receipt.expiresAt }
    });
  }

  if (receipt.status !== STATUS.APPROVED) {
    throw new Error(`Cannot consume receipt with status "${receipt.status}". Must be APPROVED.`);
  }

  // Check expiry
  if (new Date(receipt.expiresAt).getTime() < Date.now()) {
    const expired = { ...receipt, status: STATUS.EXPIRED };
    throw new ExpiredApprovalViolation({
      evidence: { nonce: receipt.nonce, expiresAt: receipt.expiresAt, now: new Date().toISOString() }
    });
  }

  // Check action match (cross-action protection)
  if (currentContext.action && currentContext.action !== receipt.action) {
    throw new CrossActionApprovalViolation({
      evidence: {
        receiptAction: receipt.action,
        requestedAction: currentContext.action,
        nonce: receipt.nonce
      }
    });
  }

  // Check scope match (cross-scope protection)
  if (currentContext.gitBranch && currentContext.gitBranch !== receipt.scope.branch) {
    throw new CrossScopeApprovalViolation({
      evidence: {
        receiptBranch: receipt.scope.branch,
        currentBranch: currentContext.gitBranch,
        field: 'branch',
        nonce: receipt.nonce
      }
    });
  }

  // Check runtime match
  if (currentContext.runtime && currentContext.runtime !== receipt.runtime) {
    throw new CrossScopeApprovalViolation({
      evidence: {
        receiptRuntime: receipt.runtime,
        currentRuntime: currentContext.runtime,
        field: 'runtime',
        nonce: receipt.nonce
      }
    });
  }

  // Check fingerprint (comprehensive scope change detection)
  if (currentContext.fingerprint && currentContext.fingerprint !== receipt.contextFingerprint) {
    throw new CrossScopeApprovalViolation({
      evidence: {
        field: 'contextFingerprint',
        nonce: receipt.nonce,
        message: 'Context fingerprint mismatch — scope has changed since approval.'
      }
    });
  }

  // All checks passed — mark nonce as consumed in memory AND persist to ledger
  markNonceConsumed(receipt.nonce);

  const consumedReceipt = {
    ...receipt,
    status: STATUS.CONSUMED,
    consumedAt: new Date().toISOString()
  };

  // Persist to filesystem ledger for cross-process enforcement
  // (non-blocking — failures are logged but don't prevent consumption)
  try {
    writeReceiptToLedger(consumedReceipt, currentContext.baseDir);
  } catch {
    // Ledger write failure is non-fatal — in-memory nonce still provides
    // single-process protection. Cross-process enforcement may be degraded.
  }

  return deepFreezeReceipt(consumedReceipt);
}

/**
 * Check if a receipt has expired (without consuming it).
 */
export function isExpired(receipt) {
  return new Date(receipt.expiresAt).getTime() < Date.now();
}

/**
 * Validate a receipt structurally without consuming it.
 * Returns array of issues found. Empty array = valid.
 */
export function validateReceiptStructure(receipt) {
  const issues = [];

  if (!receipt || typeof receipt !== 'object') {
    return [{ field: 'receipt', issue: 'NOT_AN_OBJECT' }];
  }

  if (receipt.version !== '1.0.0') {
    issues.push({ field: 'version', issue: 'UNSUPPORTED_VERSION', value: receipt.version });
  }

  if (!receipt.action || !VALID_ACTIONS.includes(receipt.action)) {
    issues.push({ field: 'action', issue: 'INVALID_OR_MISSING', value: receipt.action });
  }

  if (!receipt.runtime || typeof receipt.runtime !== 'string') {
    issues.push({ field: 'runtime', issue: 'MISSING' });
  }

  if (!receipt.scope || typeof receipt.scope !== 'object') {
    issues.push({ field: 'scope', issue: 'MISSING' });
  } else {
    if (!receipt.scope.branch) issues.push({ field: 'scope.branch', issue: 'MISSING' });
    if (!receipt.scope.paths || !Array.isArray(receipt.scope.paths)) {
      issues.push({ field: 'scope.paths', issue: 'MISSING_OR_NOT_ARRAY' });
    }
  }

  if (!receipt.nonce || typeof receipt.nonce !== 'string') {
    issues.push({ field: 'nonce', issue: 'MISSING' });
  }

  if (!receipt.contextFingerprint || !isValidFingerprintFormat(receipt.contextFingerprint)) {
    issues.push({ field: 'contextFingerprint', issue: 'MISSING_OR_INVALID' });
  }

  if (!receipt.expiresAt || isNaN(Date.parse(receipt.expiresAt))) {
    issues.push({ field: 'expiresAt', issue: 'MISSING_OR_INVALID' });
  }

  if (!receipt.status || !Object.values(STATUS).includes(receipt.status)) {
    issues.push({ field: 'status', issue: 'MISSING_OR_INVALID', value: receipt.status });
  }

  // Check for secrets in receipt (must never contain secrets)
  const receiptStr = JSON.stringify(receipt);
  if (/api[_-]?key|token|secret|password|credential/i.test(receiptStr)) {
    issues.push({ field: 'content', issue: 'POTENTIAL_SECRET_IN_RECEIPT' });
  }

  return issues;
}

// ── Nonce Ledger (Single-Use Enforcement) ────────────────────────

/**
 * In-memory nonce ledger for single-use enforcement within a process.
 * For cross-process enforcement, use the filesystem ledger.
 */
const consumedNonces = new Set();

export function markNonceConsumed(nonce) {
  consumedNonces.add(nonce);
}

export function isNonceConsumed(nonce) {
  return consumedNonces.has(nonce);
}

// ── Filesystem Ledger (Cross-Process) ─────────────────────────────

const DEFAULT_LEDGER_DIR = '.opencode/approvals';

export function getLedgerPath(baseDir = process.cwd()) {
  return resolve(baseDir, DEFAULT_LEDGER_DIR);
}

export function writeReceiptToLedger(receipt, baseDir = process.cwd()) {
  const ledgerDir = getLedgerPath(baseDir);
  mkdirSync(ledgerDir, { recursive: true });
  const filePath = resolve(ledgerDir, `${receipt.nonce}.json`);
  writeFileSync(filePath, JSON.stringify(receipt, null, 2), 'utf-8');
  return filePath;
}

export function readReceiptFromLedger(nonce, baseDir = process.cwd()) {
  const ledgerDir = getLedgerPath(baseDir);
  const filePath = resolve(ledgerDir, `${nonce}.json`);
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function listLedgerReceipts(baseDir = process.cwd()) {
  const ledgerDir = getLedgerPath(baseDir);
  try {
    const files = readdirSync(ledgerDir).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try {
        return JSON.parse(readFileSync(resolve(ledgerDir, f), 'utf-8'));
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Cross-Action Protection ──────────────────────────────────────

/** Actions that are mutually exclusive (approval for one ≠ approval for another) */
const MUTUALLY_EXCLUSIVE_ACTIONS = [
  ['push', 'merge'],
  ['push', 'deploy'],
  ['merge', 'deploy'],
  ['apply', 'deploy'],
  ['skill_write', 'memory_write'],
  ['shell_write', 'docker_socket'],
  ['shell_write', 'ssh_write'],
  ['email_read', 'email_send'],
  ['calendar_read', 'calendar_write']
];

export function areActionsMutuallyExclusive(actionA, actionB) {
  return MUTUALLY_EXCLUSIVE_ACTIONS.some(
    pair => (pair[0] === actionA && pair[1] === actionB) || (pair[0] === actionB && pair[1] === actionA)
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function validateTransition(receipt, targetStatus) {
  const currentStatus = receipt.status || STATUS.NOT_REQUESTED;
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.has(targetStatus)) {
    throw new Error(`Invalid status transition: ${currentStatus} → ${targetStatus}`);
  }
}

function extractRepoName(targetRoot) {
  // Redacted: only use last path segment (no user paths)
  const parts = targetRoot.split('/');
  return parts[parts.length - 1] || 'unknown';
}

function deepFreezeReceipt(receipt) {
  const frozen = { ...receipt };
  Object.keys(frozen).forEach(key => {
    const val = frozen[key];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      frozen[key] = Object.freeze({ ...val });
    } else if (Array.isArray(val)) {
      frozen[key] = Object.freeze([...val]);
    }
  });
  return Object.freeze(frozen);
}

// ── Re-exports ────────────────────────────────────────────────────

export { STATUS as APPROVAL_STATUSES, VALID_ACTIONS, DEFAULT_EXPIRY_MS, MAX_EXPIRY_MS };
