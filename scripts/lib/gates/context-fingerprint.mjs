/**
 * Context Fingerprint Generation
 *
 * Creates a SHA-256 fingerprint of the execution context to detect
 * scope changes that would invalidate an approval receipt.
 *
 * IMPORTANT (from compliance review):
 * The fingerprint MUST NOT capture PII, user paths, or sensitive data.
 * Only structural, non-personal signals are included.
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Signal categories that are safe for fingerprinting (no PII).
 * Each category contributes normalized, non-personal data.
 */
const SIGNAL_CATEGORIES = {
  REPOSITORY: 'repository',
  BRANCH: 'branch',
  COMMIT: 'commit',
  ACTION: 'action',
  RUNTIME: 'runtime',
  RISK_TIER: 'risk_tier',
  SCOPE_PATHS: 'scope_paths',
  POLICY_CHECKSUM: 'policy_checksum',
  MANIFEST_CHECKSUM: 'manifest_checksum',
  STRUCTURAL_CONFIG: 'structural_config'
};

/**
 * Redact potential PII from file paths before fingerprinting.
 * Replaces user home directories and identifiable segments with placeholders.
 */
function redactPath(filePath) {
  // Strip home directory to avoid user identification
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home && filePath.startsWith(home)) {
    filePath = '~' + filePath.slice(home.length);
  }
  // Strip any absolute paths to tmp directories that may contain usernames
  filePath = filePath.replace(/\/tmp\/[^/]+/g, '/tmp/REDACTED');
  // Strip potential UUID-like directory names (session IDs)
  filePath = filePath.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/REDACTED_SESSION');
  return filePath;
}

/**
 * Generate a context fingerprint from non-PII structural signals.
 *
 * @param {Object} params
 * @param {string} params.targetRoot - Absolute path to project root
 * @param {string} [params.gitBranch] - Current git branch (REMOTE-independent)
 * @param {string} [params.gitCommit] - Current HEAD commit SHA
 * @param {string} params.action - Action being approved (push, apply, merge, etc.)
 * @param {string} params.runtime - Runtime identifier (opencode, hermes, odysseus, generic)
 * @param {string} params.riskTier - Risk tier from canonical working method
 * @param {string[]} [params.scopePaths=[]] - Paths within scope (redacted)
 * @param {string} [params.policyFile] - Path to policy file for checksum
 * @returns {string} SHA-256 hex fingerprint
 */
export function generateContextFingerprint({
  targetRoot,
  gitBranch = 'unknown',
  gitCommit = 'unknown',
  action,
  runtime,
  riskTier,
  scopePaths = [],
  policyFile = null
}) {
  const signals = [];

  // Repository signal: redacted project root (no absolute user paths)
  const redactedRoot = redactPath(targetRoot);
  signals.push(`${SIGNAL_CATEGORIES.REPOSITORY}:${redactedRoot}`);

  // Branch signal: local branch name only (no remote URL)
  signals.push(`${SIGNAL_CATEGORIES.BRANCH}:${gitBranch}`);

  // Commit signal: SHA only (no author/email/message)
  signals.push(`${SIGNAL_CATEGORIES.COMMIT}:${gitCommit}`);

  // Action signal
  signals.push(`${SIGNAL_CATEGORIES.ACTION}:${action}`);

  // Runtime signal
  signals.push(`${SIGNAL_CATEGORIES.RUNTIME}:${runtime}`);

  // Risk tier signal
  signals.push(`${SIGNAL_CATEGORIES.RISK_TIER}:${riskTier}`);

  // Scope paths: redacted and normalized
  const normalizedPaths = scopePaths
    .map(p => redactPath(p))
    .sort(); // deterministic ordering
  signals.push(`${SIGNAL_CATEGORIES.SCOPE_PATHS}:${normalizedPaths.join(',')}`);

  // Policy checksum: structural integrity of the policy file itself
  if (policyFile) {
    try {
      const policyContent = readFileSync(policyFile, 'utf-8');
      const policyHash = createHash('sha256').update(policyContent).digest('hex');
      signals.push(`${SIGNAL_CATEGORIES.POLICY_CHECKSUM}:${policyHash}`);
    } catch {
      // Policy file not readable — record as missing
      signals.push(`${SIGNAL_CATEGORIES.POLICY_CHECKSUM}:MISSING`);
    }
  }

  // Structural config checksum from known config files in target
  const configPatterns = [
    resolve(targetRoot, 'opencode.jsonc'),
    resolve(targetRoot, 'opencode.json'),
    resolve(targetRoot, '.hermes.md'),
    resolve(targetRoot, 'ecosystem.manifest.json')
  ];
  for (const f of configPatterns) {
    try {
      if (existsSync(f)) {
        const content = readFileSync(f, 'utf-8');
        const hash = createHash('sha256').update(content).digest('hex');
        signals.push(`config_${f.split('/').pop()}:${hash.substring(0, 16)}`);
      }
    } catch { /* file does not exist or unreadable — skip */ }
  }

  // Generate SHA-256 fingerprint
  const fingerprintInput = signals.join('\n');
  return createHash('sha256').update(fingerprintInput).digest('hex');
}

/**
 * Verify that a stored fingerprint matches the current context.
 *
 * @param {string} storedFingerprint - The fingerprint from the approval receipt
 * @param {Object} currentContext - Parameters for generateContextFingerprint
 * @returns {{ valid: boolean, currentFingerprint: string }}
 */
export function verifyContextFingerprint(storedFingerprint, currentContext) {
  const currentFingerprint = generateContextFingerprint(currentContext);
  return {
    valid: storedFingerprint === currentFingerprint,
    currentFingerprint
  };
}

/**
 * Validate that a fingerprint string looks structurally valid.
 * Does NOT check cryptographic correctness — only format.
 */
export function isValidFingerprintFormat(fingerprint) {
  return typeof fingerprint === 'string' && /^[a-f0-9]{64}$/.test(fingerprint);
}
