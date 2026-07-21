// SPDX-License-Identifier: MIT
/**
 * Scope-bound, single-use approval receipts.
 *
 * The receipt file is local owner-approved input. It is not a signed token:
 * integrity_hash detects accidental/simple tampering, while the fixed local
 * ledger provides atomic single-use enforcement across processes.
 */

import { randomUUID, createHash } from 'node:crypto';
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  lstatSync,
  realpathSync
} from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateContextFingerprint, isValidFingerprintFormat } from './context-fingerprint.mjs';
import {
  ApprovalReuseViolation,
  ApprovalIntegrityViolation,
  CrossActionApprovalViolation,
  CrossScopeApprovalViolation,
  ExpiredApprovalViolation
} from './errors.mjs';

const STATUS = Object.freeze({
  NOT_REQUESTED: 'NOT_REQUESTED',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
  EXPIRED: 'EXPIRED',
  CONSUMED: 'CONSUMED'
});

const VALID_TRANSITIONS = Object.freeze({
  [STATUS.NOT_REQUESTED]: new Set([STATUS.PENDING]),
  [STATUS.PENDING]: new Set([STATUS.APPROVED, STATUS.DENIED, STATUS.EXPIRED]),
  [STATUS.APPROVED]: new Set([STATUS.CONSUMED, STATUS.EXPIRED]),
  [STATUS.DENIED]: new Set(),
  [STATUS.EXPIRED]: new Set(),
  [STATUS.CONSUMED]: new Set()
});

const VALID_ACTIONS = Object.freeze([
  'apply', 'commit', 'push', 'pr', 'merge', 'deploy', 'remote_ci',
  'skill_write', 'memory_write', 'mcp_tier_2', 'shell_write', 'ssh_write',
  'email_send', 'calendar_write', 'model_download', 'docker_socket',
  'email_read', 'calendar_read'
]);

const VALID_RISK_TIERS = Object.freeze([
  'LOW_LOCAL', 'MEDIUM_REVIEW', 'HIGH_HUMAN_GATE', 'CRITICAL_BLOCK'
]);

const VALID_PHASES = Object.freeze([
  'reality', 'route', 'before-implement', 'verify', 'runtime-smoke', 'close'
]);

const DEFAULT_EXPIRY_MS = 60 * 60 * 1000;
const MAX_EXPIRY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LEDGER_DIR = '.opencode/approvals';
const FULL_SHA = /^[a-f0-9]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^sha256:[a-f0-9]{64}$/;

const consumedNonces = new Set();

/** Return a canonical absolute project path and reject a symlink root. */
export function canonicalProjectPath(value, { allowMissing = false } = {}) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new Error('Project path must be absolute.');
  }
  const absolute = resolve(value);
  if (!existsSync(absolute)) {
    if (!allowMissing) throw new Error(`Project path does not exist: ${absolute}`);
    return absolute;
  }
  if (lstatSync(absolute).isSymbolicLink()) {
    throw new Error('Project root must not be a symlink.');
  }
  return realpathSync(absolute);
}

function gitValue(projectPath, args) {
  try {
    return execFileSync('git', args, {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

function normalizeRepositoryIdentity(remote) {
  if (!remote) return null;
  let value = remote.trim();
  if (value.startsWith('git@')) value = `https://${value.slice(4).replace(':', '/')}`;
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.hash = '';
    url.search = '';
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$|\.git$/g, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.replace(/\.git$/, '');
  }
}

/** Derive the current repository binding without reading author/secret data. */
export function getRepositoryContext(targetRoot) {
  const projectPath = canonicalProjectPath(targetRoot);
  const head = gitValue(projectPath, ['rev-parse', 'HEAD']);
  const branch = gitValue(projectPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const remote = normalizeRepositoryIdentity(gitValue(projectPath, ['config', '--get', 'remote.origin.url']));
  return {
    repository_identity: remote || `local:${projectPath}`,
    project_path: projectPath,
    branch: branch || 'DETACHED_HEAD',
    head: head || null
  };
}

function normalizeScope(scope) {
  if (!Array.isArray(scope)) throw new Error('Receipt scope must be an array.');
  const normalized = scope.map((entry) => {
    if (typeof entry !== 'string' || entry.length === 0 || entry.includes('\0')) {
      throw new Error('Receipt scope entries must be non-empty strings.');
    }
    return entry;
  });
  return [...new Set(normalized)].sort();
}

function makeScopeArray(entries, details) {
  const scope = [...entries];
  Object.defineProperties(scope, {
    branch: { value: details.branch, enumerable: false },
    commit: { value: details.head, enumerable: false },
    paths: { value: scope, enumerable: false },
    repository: { value: details.repository_identity, enumerable: false },
    targetRoot: { value: details.project_path, enumerable: false }
  });
  return scope;
}

function scopeDetails(receipt) {
  if (receipt.scope_details && typeof receipt.scope_details === 'object') {
    return receipt.scope_details;
  }
  // Read-only compatibility for old files. They are rejected by structural
  // validation unless they also carry the canonical fields.
  if (receipt.scope && !Array.isArray(receipt.scope)) return receipt.scope;
  return {};
}

function canonicalScope(receipt) {
  if (Array.isArray(receipt.scope)) return normalizeScope(receipt.scope);
  if (Array.isArray(scopeDetails(receipt).operations)) return normalizeScope(scopeDetails(receipt).operations);
  if (Array.isArray(scopeDetails(receipt).paths)) return normalizeScope(scopeDetails(receipt).paths);
  return [];
}

function integrityPayload(receipt) {
  return {
    schema_version: receipt.schema_version,
    receipt_id: receipt.receipt_id,
    repository_identity: receipt.repository_identity,
    project_path: receipt.project_path,
    branch: receipt.branch,
    head: receipt.head,
    phase: receipt.phase,
    action: receipt.action,
    scope: canonicalScope(receipt),
    risk_tier: receipt.risk_tier,
    issued_by: receipt.issued_by,
    issued_at: receipt.issued_at,
    expires_at: receipt.expires_at,
    single_use: receipt.single_use,
    status: receipt.status,
    approved_by: receipt.approved_by || null,
    approved_at: receipt.approved_at || null,
    runtime: receipt.runtime
  };
}

export function computeReceiptIntegrity(receipt) {
  const serialized = JSON.stringify(integrityPayload(receipt));
  return `sha256:${createHash('sha256').update(serialized).digest('hex')}`;
}

function freezeValue(value) {
  if (Array.isArray(value)) {
    const clone = [...value];
    for (const key of ['branch', 'commit', 'paths', 'repository', 'targetRoot']) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        Object.defineProperty(clone, key, Object.getOwnPropertyDescriptor(value, key));
      }
    }
    return Object.freeze(clone);
  }
  if (value && typeof value === 'object') return Object.freeze({ ...value });
  return value;
}

function deepFreezeReceipt(receipt) {
  const frozen = { ...receipt };
  for (const key of Object.keys(frozen)) frozen[key] = freezeValue(frozen[key]);
  return Object.freeze(frozen);
}

function buildReceipt({
  action,
  runtime,
  targetRoot,
  gitBranch,
  gitCommit,
  riskTier,
  scopePaths,
  policyFile,
  expiresInMs,
  phase,
  issuedBy,
  repositoryIdentity,
  projectPath,
  status = STATUS.NOT_REQUESTED,
  approvedBy = null,
  approvedAt = null,
  receiptId = randomUUID(),
  issuedAt = new Date().toISOString()
}) {
  const canonicalProject = canonicalProjectPath(projectPath || targetRoot, { allowMissing: true });
  const derived = existsSync(canonicalProject) ? getRepositoryContext(canonicalProject) : {
    repository_identity: `local:${canonicalProject}`,
    project_path: canonicalProject,
    branch: null,
    head: null
  };
  const branch = gitBranch || derived.branch;
  const head = gitCommit || derived.head;
  const repository = repositoryIdentity || derived.repository_identity;
  const scope = normalizeScope(scopePaths || []);
  if (!branch || typeof branch !== 'string') throw new Error('Receipt branch is required.');
  if (!head || !FULL_SHA.test(head)) throw new Error('Receipt head must be a full 40-character commit SHA.');
  if (!repository || typeof repository !== 'string') throw new Error('Receipt repository identity is required.');
  if (!UUID.test(receiptId)) throw new Error('Receipt ID must be a UUID.');
  if (!VALID_PHASES.includes(phase)) throw new Error(`Invalid receipt phase: ${phase}`);
  if (!VALID_RISK_TIERS.includes(riskTier)) throw new Error(`Invalid risk tier: ${riskTier}`);
  if (!issuedBy || typeof issuedBy !== 'string') throw new Error('Receipt issuer is required.');

  const actualExpiry = Math.min(Number(expiresInMs), MAX_EXPIRY_MS);
  const expiresAt = new Date(Date.parse(issuedAt) + actualExpiry).toISOString();
  const contextFingerprint = generateContextFingerprint({
    targetRoot: canonicalProject,
    gitBranch: branch,
    gitCommit: head,
    action,
    runtime,
    riskTier,
    scopePaths: scope,
    policyFile
  });

  const canonical = {
    schema_version: '1.0',
    receipt_id: receiptId,
    repository_identity: repository,
    project_path: canonicalProject,
    branch,
    head,
    phase,
    action,
    scope: makeScopeArray(scope, { repository_identity: repository, project_path: canonicalProject, branch, head }),
    risk_tier: riskTier,
    issued_by: issuedBy,
    issued_at: issuedAt,
    expires_at: expiresAt,
    single_use: true,
    status,
    approved_by: approvedBy,
    approved_at: approvedAt,
    runtime,
    contextFingerprint,
    integrity_hash: null
  };
  canonical.scope_details = {
    repository_identity: repository,
    project_path: canonicalProject,
    branch,
    head,
    phase,
    action,
    operations: [...scope]
  };
  canonical.integrity_hash = computeReceiptIntegrity(canonical);

  // Compatibility aliases are deliberately non-authoritative.
  return deepFreezeReceipt({
    ...canonical,
    version: '1.0.0',
    nonce: receiptId,
    riskTier,
    approvedBy,
    approvedAt,
    expiresAt,
    singleUse: true
  });
}

export function createApprovalReceipt({
  action,
  runtime,
  targetRoot,
  gitBranch,
  gitCommit,
  riskTier = 'MEDIUM_REVIEW',
  scopePaths = [],
  policyFile = null,
  expiresInMs = DEFAULT_EXPIRY_MS,
  phase = 'before-implement',
  issuedBy = 'owner',
  repositoryIdentity = null,
  projectPath = null
}) {
  if (!VALID_ACTIONS.includes(action)) {
    throw new Error(`Invalid action: "${action}". Valid actions: ${VALID_ACTIONS.join(', ')}`);
  }
  if (!runtime || typeof runtime !== 'string') throw new Error('Receipt runtime is required.');
  return buildReceipt({
    action, runtime, targetRoot, gitBranch, gitCommit, riskTier, scopePaths,
    policyFile, expiresInMs, phase, issuedBy, repositoryIdentity, projectPath
  });
}

export function approveReceipt(receipt, approvedBy) {
  validateTransition(receipt, STATUS.APPROVED);
  const issues = validateReceiptStructure(receipt);
  if (issues.length > 0) throw new ApprovalIntegrityViolation({ evidence: { issues } });
  if (!approvedBy || typeof approvedBy !== 'string') throw new Error('Approver identity is required.');
  const updated = {
    ...receipt,
    status: STATUS.APPROVED,
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
    approvedBy,
    approvedAt: new Date().toISOString(),
    integrity_hash: null
  };
  updated.integrity_hash = computeReceiptIntegrity(updated);
  return deepFreezeReceipt(updated);
}

export function denyReceipt(receipt) {
  validateTransition(receipt, STATUS.DENIED);
  const updated = { ...receipt, status: STATUS.DENIED, integrity_hash: null };
  updated.integrity_hash = computeReceiptIntegrity(updated);
  return deepFreezeReceipt(updated);
}

function currentScopeFromContext(currentContext) {
  if (Array.isArray(currentContext.scope)) return normalizeScope(currentContext.scope);
  if (Array.isArray(currentContext.scopePaths)) return normalizeScope(currentContext.scopePaths);
  return null;
}

function contextMismatch(receipt, current, field, expected, actual) {
  if (expected === actual) return null;
  return new CrossScopeApprovalViolation({
    evidence: { field, receipt: expected, current: actual, nonce: receipt.receipt_id || receipt.nonce }
  });
}

function requireCurrentContext(receipt, currentContext) {
  const projectValue = currentContext.project_path || currentContext.projectPath || currentContext.targetRoot;
  if (!projectValue) throw new CrossScopeApprovalViolation({ evidence: { field: 'project_path', nonce: receipt.receipt_id } });
  const projectPath = canonicalProjectPath(projectValue, { allowMissing: currentContext.allowMissingProject === true });
  let repo = currentContext.repository_identity || currentContext.repositoryIdentity;
  let branch = currentContext.branch || currentContext.gitBranch;
  let head = currentContext.head || currentContext.gitCommit;
  if (!repo || !branch || !head) {
    const derived = getRepositoryContext(projectPath);
    repo ||= derived.repository_identity;
    branch ||= derived.branch;
    head ||= derived.head;
  }
  const scope = currentScopeFromContext(currentContext);
  if (scope === null && canonicalScope(receipt).length > 0) {
    throw new CrossScopeApprovalViolation({ evidence: { field: 'scope', reason: 'current scope is missing', nonce: receipt.receipt_id } });
  }
  return {
    repository_identity: repo,
    project_path: projectPath,
    branch,
    head,
    phase: currentContext.phase,
    action: currentContext.action,
    runtime: currentContext.runtime,
    risk_tier: currentContext.risk_tier || currentContext.riskTier,
    scope: scope || [],
    policyFile: currentContext.policyFile
  };
}

export function consumeReceipt(receipt, currentContext = {}) {
  const structureIssues = validateReceiptStructure(receipt);
  if (structureIssues.length > 0) {
    throw new ApprovalIntegrityViolation({ evidence: { issues: structureIssues, nonce: receipt?.receipt_id || receipt?.nonce } });
  }
  if (isNonceConsumed(receipt.receipt_id)) {
    throw new ApprovalReuseViolation({ evidence: { nonce: receipt.receipt_id, action: receipt.action } });
  }
  if (receipt.status === STATUS.CONSUMED) {
    throw new ApprovalReuseViolation({ evidence: { nonce: receipt.receipt_id, action: receipt.action } });
  }
  if (receipt.status === STATUS.EXPIRED || isExpired(receipt)) {
    throw new ExpiredApprovalViolation({ evidence: { nonce: receipt.receipt_id, expiresAt: receipt.expires_at } });
  }
  if (receipt.status !== STATUS.APPROVED) {
    throw new Error(`Cannot consume receipt with status "${receipt.status}". Must be APPROVED.`);
  }

  const current = requireCurrentContext(receipt, currentContext);
  for (const [field, expected, actual] of [
    ['repository_identity', receipt.repository_identity, current.repository_identity],
    ['project_path', receipt.project_path, current.project_path],
    ['branch', receipt.branch, current.branch],
    ['head', receipt.head, current.head],
    ['phase', receipt.phase, current.phase],
    ['risk_tier', receipt.risk_tier, current.risk_tier],
  ]) {
    const mismatch = contextMismatch(receipt, current, field, expected, actual);
    if (mismatch) throw mismatch;
  }
  if (current.action && current.action !== receipt.action) {
    throw new CrossActionApprovalViolation({ evidence: { receiptAction: receipt.action, requestedAction: current.action, nonce: receipt.receipt_id } });
  }
  if (current.runtime && current.runtime !== receipt.runtime) {
    throw new CrossScopeApprovalViolation({ evidence: { field: 'runtime', receipt: receipt.runtime, current: current.runtime, nonce: receipt.receipt_id } });
  }
  const receiptScope = canonicalScope(receipt);
  for (const operation of current.scope) {
    if (!receiptScope.includes(operation)) {
      throw new CrossScopeApprovalViolation({ evidence: { field: 'scope', operation, nonce: receipt.receipt_id } });
    }
  }
  const currentFingerprint = generateContextFingerprint({
    targetRoot: current.project_path,
    gitBranch: current.branch,
    gitCommit: current.head,
    action: receipt.action,
    runtime: receipt.runtime,
    riskTier: current.risk_tier,
    scopePaths: current.scope,
    policyFile: current.policyFile
  });
  if (currentFingerprint !== receipt.contextFingerprint) {
    throw new CrossScopeApprovalViolation({ evidence: { field: 'contextFingerprint', nonce: receipt.receipt_id } });
  }

  const atomicResult = atomicConsumeNonce(receipt.receipt_id, currentContext.baseDir || current.project_path);
  if (!atomicResult.consumed) {
    throw new ApprovalReuseViolation({ evidence: { nonce: receipt.receipt_id, reason: atomicResult.reason } });
  }
  markNonceConsumed(receipt.receipt_id);

  const consumedAt = new Date().toISOString();
  const consumedReceipt = { ...receipt, status: STATUS.CONSUMED, consumed_at: consumedAt, consumedAt, integrity_hash: null };
  consumedReceipt.integrity_hash = computeReceiptIntegrity(consumedReceipt);
  try {
    writeReceiptToLedger(consumedReceipt, currentContext.baseDir || current.project_path);
  } catch (error) {
    throw new ApprovalIntegrityViolation({ evidence: { field: 'ledger', reason: error.message, nonce: receipt.receipt_id } });
  }
  return deepFreezeReceipt(consumedReceipt);
}

export function isExpired(receipt) {
  return Date.parse(receipt.expires_at || receipt.expiresAt) < Date.now();
}

export function validateReceiptStructure(receipt) {
  const issues = [];
  if (!receipt || typeof receipt !== 'object') return [{ field: 'receipt', issue: 'NOT_AN_OBJECT' }];
  if (receipt.schema_version !== '1.0') issues.push({ field: 'schema_version', issue: 'UNSUPPORTED_OR_MISSING' });
  if (!receipt.receipt_id || !UUID.test(receipt.receipt_id)) {
    issues.push({ field: 'receipt_id', issue: 'MISSING_OR_INVALID' });
    if (!receipt.nonce) issues.push({ field: 'nonce', issue: 'MISSING' });
  }
  if (!receipt.repository_identity || typeof receipt.repository_identity !== 'string') issues.push({ field: 'repository_identity', issue: 'MISSING' });
  if (!receipt.project_path || !isAbsolute(receipt.project_path)) issues.push({ field: 'project_path', issue: 'MISSING_OR_NOT_ABSOLUTE' });
  else {
    try {
      if (canonicalProjectPath(receipt.project_path, { allowMissing: true }) !== receipt.project_path) issues.push({ field: 'project_path', issue: 'NOT_CANONICAL' });
    } catch (error) { issues.push({ field: 'project_path', issue: 'UNSAFE', message: error.message }); }
  }
  if (!receipt.branch || typeof receipt.branch !== 'string') issues.push({ field: 'branch', issue: 'MISSING' });
  if (!receipt.head || !FULL_SHA.test(receipt.head)) issues.push({ field: 'head', issue: 'MISSING_OR_NOT_FULL_SHA' });
  if (!receipt.phase || !VALID_PHASES.includes(receipt.phase)) issues.push({ field: 'phase', issue: 'MISSING_OR_INVALID' });
  if (!receipt.action || !VALID_ACTIONS.includes(receipt.action)) issues.push({ field: 'action', issue: 'INVALID_OR_MISSING' });
  if (!Array.isArray(receipt.scope)) issues.push({ field: 'scope', issue: 'MISSING_OR_NOT_ARRAY' });
  else {
    try { normalizeScope(receipt.scope); } catch (error) { issues.push({ field: 'scope', issue: error.message }); }
  }
  if (!receipt.risk_tier || !VALID_RISK_TIERS.includes(receipt.risk_tier)) issues.push({ field: 'risk_tier', issue: 'MISSING_OR_INVALID' });
  if (!receipt.issued_by || typeof receipt.issued_by !== 'string') issues.push({ field: 'issued_by', issue: 'MISSING' });
  if (!receipt.issued_at || Number.isNaN(Date.parse(receipt.issued_at))) issues.push({ field: 'issued_at', issue: 'MISSING_OR_INVALID' });
  if (!receipt.expires_at || Number.isNaN(Date.parse(receipt.expires_at))) issues.push({ field: 'expires_at', issue: 'MISSING_OR_INVALID' });
  if (receipt.single_use !== true) issues.push({ field: 'single_use', issue: 'MUST_BE_TRUE' });
  if (!receipt.runtime || typeof receipt.runtime !== 'string') issues.push({ field: 'runtime', issue: 'MISSING' });
  if (!receipt.contextFingerprint || !isValidFingerprintFormat(receipt.contextFingerprint)) issues.push({ field: 'contextFingerprint', issue: 'MISSING_OR_INVALID' });
  if (!receipt.status || !Object.values(STATUS).includes(receipt.status)) issues.push({ field: 'status', issue: 'MISSING_OR_INVALID', value: receipt.status });
  if (!receipt.integrity_hash || !HASH.test(receipt.integrity_hash)) issues.push({ field: 'integrity_hash', issue: 'MISSING_OR_INVALID' });
  if (receipt.integrity_hash && computeReceiptIntegrity(receipt) !== receipt.integrity_hash) issues.push({ field: 'integrity_hash', issue: 'MISMATCH' });

  const content = JSON.stringify(receipt);
  if (/api[_-]?key|token|secret|password|credential/i.test(content)) issues.push({ field: 'content', issue: 'POTENTIAL_SECRET_IN_RECEIPT' });
  return issues;
}

export function markNonceConsumed(nonce) { consumedNonces.add(nonce); }
export function isNonceConsumed(nonce) { return consumedNonces.has(nonce); }

function assertSafeLedgerPath(baseDir) {
  const projectPath = canonicalProjectPath(baseDir);
  const rel = relative(projectPath, resolve(projectPath, DEFAULT_LEDGER_DIR));
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Approval ledger escapes project scope.');
  const opencode = resolve(projectPath, '.opencode');
  const approvals = resolve(projectPath, DEFAULT_LEDGER_DIR);
  if (existsSync(opencode) && lstatSync(opencode).isSymbolicLink()) throw new Error('Approval ledger parent must not be a symlink.');
  if (existsSync(approvals) && lstatSync(approvals).isSymbolicLink()) throw new Error('Approval ledger must not be a symlink.');
  return approvals;
}

export function getLedgerPath(baseDir = process.cwd()) { return assertSafeLedgerPath(baseDir); }

export function atomicConsumeNonce(nonce, baseDir = process.cwd()) {
  if (typeof nonce !== 'string' || !UUID.test(nonce)) throw new Error('Receipt ID must be a UUID.');
  const ledgerDir = getLedgerPath(baseDir);
  mkdirSync(ledgerDir, { recursive: true, mode: 0o700 });
  const nonceHash = createHash('sha256').update(nonce).digest('hex');
  const filePath = resolve(ledgerDir, `consumed-${nonceHash}.json`);
  try {
    writeFileSync(filePath, JSON.stringify({ receipt_id: nonce, consumed_at: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
    return { consumed: true, path: filePath };
  } catch (error) {
    if (error.code === 'EEXIST') return { consumed: false, path: filePath, reason: 'receipt already consumed (cross-process)' };
    throw error;
  }
}

export function writeReceiptToLedger(receipt, baseDir = process.cwd()) {
  const ledgerDir = getLedgerPath(baseDir);
  mkdirSync(ledgerDir, { recursive: true, mode: 0o700 });
  const filePath = resolve(ledgerDir, `${receipt.receipt_id || receipt.nonce}.json`);
  if (!UUID.test(receipt.receipt_id || receipt.nonce)) throw new Error('Invalid receipt ID for ledger path.');
  writeFileSync(filePath, JSON.stringify(receipt, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return filePath;
}

export function readReceiptFromLedger(receiptId, baseDir = process.cwd()) {
  if (typeof receiptId !== 'string' || !UUID.test(receiptId)) return null;
  const filePath = resolve(getLedgerPath(baseDir), `${receiptId}.json`);
  try { return JSON.parse(readFileSync(filePath, 'utf8')); } catch { return null; }
}

export function listLedgerReceipts(baseDir = process.cwd()) {
  const ledgerDir = getLedgerPath(baseDir);
  try {
    return readdirSync(ledgerDir).filter((name) => UUID.test(name.replace(/\.json$/, ''))).map((name) => {
      try { return JSON.parse(readFileSync(resolve(ledgerDir, name), 'utf8')); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

const MUTUALLY_EXCLUSIVE_ACTIONS = [
  ['push', 'merge'], ['push', 'deploy'], ['merge', 'deploy'], ['apply', 'deploy'],
  ['skill_write', 'memory_write'], ['shell_write', 'docker_socket'],
  ['shell_write', 'ssh_write'], ['email_read', 'email_send'], ['calendar_read', 'calendar_write']
];

export function areActionsMutuallyExclusive(actionA, actionB) {
  return MUTUALLY_EXCLUSIVE_ACTIONS.some(([a, b]) => (a === actionA && b === actionB) || (a === actionB && b === actionA));
}

function validateTransition(receipt, targetStatus) {
  const allowed = VALID_TRANSITIONS[receipt.status || STATUS.NOT_REQUESTED];
  if (!allowed || !allowed.has(targetStatus)) throw new Error(`Invalid status transition: ${receipt.status} → ${targetStatus}`);
}

export {
  STATUS as APPROVAL_STATUSES,
  VALID_ACTIONS,
  VALID_RISK_TIERS,
  VALID_PHASES,
  DEFAULT_EXPIRY_MS,
  MAX_EXPIRY_MS
};
