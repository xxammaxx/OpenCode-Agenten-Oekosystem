// SPDX-License-Identifier: MIT
/**
 * Evidence Validation
 *
 * Validates evidence claims against the evidence gate policy.
 * Every claim type has mandatory evidence requirements defined in
 * .opencode/policies/evidence-gates.json.
 *
 * This module does NOT collect evidence — it validates that required
 * evidence is present, structurally valid, and not fabricated.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

// ── Default Evidence Gate Policy (embedded) ───────────────────────
// Normally loaded from .opencode/policies/evidence-gates.json,
// but embedded here as a hard-coded floor that cannot be removed.

/** @const Minimum required evidence for each claim type */
const MINIMUM_EVIDENCE_REQUIREMENTS = Object.freeze({
  severity_claim: {
    required: ['reproducible_poc', 'log_output', 'cvss_vector', 'impact_screenshot', 'reproduction_environment'],
    prohibitWithout: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
    allowFallback: 'UNVERIFIED',
    validation: {
      cvss_minimum_metrics: ['AV', 'AC', 'PR', 'UI', 'S', 'C', 'I', 'A'],
      poc_must_be: 'runnable_and_deterministic',
      logs_must_be: 'actual_captured_output'
    }
  },
  architecture_decision: {
    required: ['adr_document', 'dependency_impact_analysis', 'coupling_analysis', 'alternative_evaluation'],
    prohibitWithout: ['migration_approval', 'breaking_change'],
    allowFallback: 'PROPOSAL_ONLY'
  },
  migration_approval: {
    required: ['rollback_tested', 'data_integrity_verified', 'backup_confirmed', 'dry_run_output'],
    prohibitWithout: ['ready_for_production'],
    allowFallback: 'PENDING_REVIEW'
  },
  bug_fix_claim: {
    required: ['failing_test_before', 'passing_test_after', 'regression_test_added', 'git_diff_stat'],
    prohibitWithout: ['fixed', 'resolved'],
    allowFallback: 'PENDING_VERIFICATION'
  },
  feature_complete: {
    required: ['acceptance_criteria_met', 'test_coverage_maintained', 'spec_compliance_verified'],
    prohibitWithout: ['done', 'completed'],
    allowFallback: 'IN_PROGRESS'
  },
  compliance_claim: {
    required: ['data_flow_diagram', 'consent_mechanism_verified', 'retention_policy_enforced', 'right_to_deletion_tested', 'data_minimization_audit'],
    prohibitWithout: ['compliant', 'dsgvo_ready', 'gdpr_ready'],
    allowFallback: 'PENDING_AUDIT'
  },
  verification_contract: {
    required: ['desired_behavior', 'acceptance_criteria', 'red_tests', 'regression_tests', 'reality_gate', 'evidence_types', 'untestable_assumptions'],
    prohibitWithout: ['ready_for_implementation'],
    allowFallback: 'PENDING_SPEC'
  },
  red_test_evidence: {
    required: ['failing_test_output_before', 'passing_test_output_after'],
    prohibitWithout: ['tdd_validated'],
    allowFallback: 'STRUCTURAL_ONLY'
  },
  tool_gap_claim: {
    required: ['tool_discovery_output', 'runtime_state', 'classification_rationale'],
    prohibitWithout: ['TOOL_GAP'],
    allowFallback: 'UNVERIFIED_GAP'
  },
  remote_operation_claim: {
    required: ['actual_api_response', 'timestamp', 'correlation_id'],
    prohibitWithout: ['remote_success', 'api_confirmed'],
    allowFallback: 'SIMULATED_LOCAL'
  }
});

// ── Evidence Types ────────────────────────────────────────────────

/** @enum {string} Structured evidence type identifiers */
export const EVIDENCE_TYPES = Object.freeze({
  FILE_EXISTS: 'file_exists',
  FILE_CONTENT: 'file_content',
  COMMAND_OUTPUT: 'command_output',
  SCREENSHOT: 'screenshot',
  LOG_OUTPUT: 'log_output',
  TEST_RESULT: 'test_result',
  API_RESPONSE: 'api_response',
  STRUCTURAL_CHECK: 'structural_check',
  CHECKSUM: 'checksum'
});

// ── Structural Evidence Validation ────────────────────────────────

/**
 * Validate that a file exists and is not empty.
 * This is structural evidence — it proves file existence, not correctness.
 */
export function validateFileExists(filePath, baseDir = process.cwd()) {
  const fullPath = resolve(baseDir, filePath);
  try {
    const stat = statSync(fullPath);
    return {
      type: EVIDENCE_TYPES.FILE_EXISTS,
      valid: stat.isFile() && stat.size > 0,
      path: fullPath,
      size: stat.size,
      mtime: stat.mtime.toISOString()
    };
  } catch {
    return {
      type: EVIDENCE_TYPES.FILE_EXISTS,
      valid: false,
      path: fullPath,
      error: 'FILE_NOT_FOUND'
    };
  }
}

/**
 * Validate that a file contains expected content or pattern.
 * Does NOT read secret files (.env, credentials, tokens, secrets).
 */
export function validateFileContent(filePath, options = {}, baseDir = process.cwd()) {
  const fullPath = resolve(baseDir, filePath);
  const { expectedPattern, expectedHash, minSize = 1, prohibitedPatterns = ['SECRET', 'TOKEN', 'CREDENTIAL', 'PASSWORD'] } = options;

  // Block reading of secret files
  const basename = filePath.toLowerCase();
  if (basename.includes('.env') || basename.includes('secret') || basename.includes('credential') || basename.includes('token')) {
    return {
      type: EVIDENCE_TYPES.FILE_CONTENT,
      valid: false,
      path: fullPath,
      error: 'SECRET_FILE_REJECTED',
      message: 'Evidence validation rejected: file appears to contain secrets.'
    };
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');

    // Check prohibited patterns
    for (const pattern of prohibitedPatterns) {
      const regex = new RegExp(`\\b${pattern}\\s*=\\s*['\"]?[^'\"\\n]{8,}`, 'gi');
      if (regex.test(content)) {
        return {
          type: EVIDENCE_TYPES.FILE_CONTENT,
          valid: false,
          path: fullPath,
          error: 'PROHIBITED_PATTERN_FOUND',
          matchedPattern: pattern
        };
      }
    }

    if (content.length < minSize) {
      return { type: EVIDENCE_TYPES.FILE_CONTENT, valid: false, path: fullPath, error: 'FILE_TOO_SMALL', size: content.length };
    }

    if (expectedPattern) {
      const regex = new RegExp(expectedPattern);
      return {
        type: EVIDENCE_TYPES.FILE_CONTENT,
        valid: regex.test(content),
        path: fullPath,
        size: content.length
      };
    }

    if (expectedHash) {
      const actualHash = createHash('sha256').update(content).digest('hex');
      return {
        type: EVIDENCE_TYPES.FILE_CONTENT,
        valid: actualHash === expectedHash,
        path: fullPath,
        hash: actualHash,
        size: content.length
      };
    }

    return { type: EVIDENCE_TYPES.FILE_CONTENT, valid: true, path: fullPath, size: content.length };
  } catch {
    return { type: EVIDENCE_TYPES.FILE_CONTENT, valid: false, path: fullPath, error: 'FILE_READ_ERROR' };
  }
}

// ── Claim-Type Evidence Validation ────────────────────────────────

/**
 * Validate that all required evidence for a claim type is present.
 *
 * @param {string} claimType - One of the keys in MINIMUM_EVIDENCE_REQUIREMENTS
 * @param {string[]} presentEvidence - List of evidence keys that are present
 * @param {string} [claimedStatus] - The claimed status (e.g., 'fixed', 'done')
 * @returns {{ valid: boolean, missing: string[], blocked: boolean, fallbackStatus: string }}
 */
export function validateClaimEvidence(claimType, presentEvidence = [], claimedStatus = null) {
  const requirements = MINIMUM_EVIDENCE_REQUIREMENTS[claimType];

  if (!requirements) {
    return {
      valid: false,
      missing: [],
      blocked: true,
      fallbackStatus: 'UNKNOWN_CLAIM_TYPE',
      message: `Unknown claim type: "${claimType}". Valid types: ${Object.keys(MINIMUM_EVIDENCE_REQUIREMENTS).join(', ')}`
    };
  }

  const required = requirements.required || [];
  const prohibitedWithout = requirements.prohibitWithout || [];
  const allowFallback = requirements.allowFallback || 'UNVERIFIED';

  // Check which required evidence is missing
  const presentSet = new Set(presentEvidence);
  const missing = required.filter(e => !presentSet.has(e));

  // Check if the claimed status is prohibited without full evidence
  let blocked = false;
  if (claimedStatus && prohibitedWithout.includes(claimedStatus) && missing.length > 0) {
    blocked = true;
  }

  const valid = missing.length === 0;

  return {
    valid,
    missing,
    blocked,
    fallbackStatus: valid ? claimedStatus : allowFallback,
    requirements: required,
    present: presentEvidence.filter(e => presentSet.has(e)),
    message: valid
      ? `All required evidence for "${claimType}" is present.`
      : `Missing required evidence for "${claimType}": ${missing.join(', ')}. Fallback status: ${allowFallback}`
  };
}

/**
 * Check if a specific claim status is prohibited without full evidence.
 *
 * @param {string} claimType
 * @param {string} status
 * @returns {boolean} true if the status is prohibited without complete evidence
 */
export function isProhibitedClaim(claimType, status) {
  const requirements = MINIMUM_EVIDENCE_REQUIREMENTS[claimType];
  if (!requirements) return true; // unknown claim type = prohibit
  return (requirements.prohibitWithout || []).includes(status);
}

/**
 * Load and merge external evidence gate policy with the embedded minimum.
 * External policy can ADD requirements but never REMOVE them.
 */
export function loadEvidenceGatePolicy(policyPath) {
  let externalPolicy = {};
  try {
    const content = readFileSync(policyPath, 'utf-8');
    externalPolicy = JSON.parse(content);
  } catch {
    // Policy file unavailable — use embedded minimum only
    return { gates: { ...MINIMUM_EVIDENCE_REQUIREMENTS } };
  }

  const merged = {};

  // Start with embedded minimum (hard-coded floor)
  for (const [claimType, requirements] of Object.entries(MINIMUM_EVIDENCE_REQUIREMENTS)) {
    merged[claimType] = { ...requirements };
  }

  // Merge external policy — can ADD requirements, never REMOVE
  const externalGates = (externalPolicy && externalPolicy.gates) || {};
  for (const [claimType, extReqs] of Object.entries(externalGates)) {
    if (!merged[claimType]) {
      // New claim type from external policy — allowed
      merged[claimType] = { ...extReqs, required: [...(extReqs.required || [])] };
    } else {
      // Existing claim type — merge required: union (additive only)
      const existing = new Set(merged[claimType].required || []);
      for (const req of (extReqs.required || [])) {
        existing.add(req);
      }
      merged[claimType].required = [...existing];

      // Merge prohibitWithout: union (additive only)
      const extProhibit = extReqs.prohibitWithout || [];
      const existingProhibit = new Set(merged[claimType].prohibitWithout || []);
      for (const p of extProhibit) {
        existingProhibit.add(p);
      }
      merged[claimType].prohibitWithout = [...existingProhibit];
    }
  }

  return { gates: Object.freeze(merged) };
}

// ── Evidence Fabrication Detection ────────────────────────────────

/**
 * Detect fabricated evidence by checking structural consistency.
 * Fabrication indicators:
 * - File timestamp in the future
 * - File creation timestamp matches execution timestamp (too perfect)
 * - Empty or zero-size evidence files
 * - Evidence files with only placeholder content
 */
export function detectFabricationIndicators(evidencePaths = [], baseDir = process.cwd()) {
  const indicators = [];
  const now = Date.now();

  for (const evPath of evidencePaths) {
    const fullPath = resolve(baseDir, evPath);
    try {
      const stat = statSync(fullPath);

      // Future timestamp (clock skew tolerance: 5 minutes)
      if (stat.mtimeMs > now + 5 * 60 * 1000) {
        indicators.push({ path: fullPath, indicator: 'FUTURE_TIMESTAMP', mtime: stat.mtime.toISOString() });
      }

      // Zero-size evidence
      if (stat.size === 0) {
        indicators.push({ path: fullPath, indicator: 'ZERO_SIZE' });
      }

      // Very small evidence (< 10 bytes — likely placeholder)
      if (stat.size < 10 && stat.size > 0) {
        indicators.push({ path: fullPath, indicator: 'SUSPICIOUSLY_SMALL', size: stat.size });
      }

      // Check content for placeholder patterns
      if (stat.size < 500) {
        const content = readFileSync(fullPath, 'utf-8');
        if (/^(TODO|FIXME|PLACEHOLDER|TBD|N\/A|none)$/im.test(content.trim())) {
          indicators.push({ path: fullPath, indicator: 'PLACEHOLDER_CONTENT', content: content.trim() });
        }
      }
    } catch {
      // File not found or unreadable — not a fabrication indicator, just missing evidence
    }
  }

  return {
    fabricated: indicators.length > 0,
    indicators
  };
}

/**
 * Get the embedded minimum evidence requirements (read-only reference).
 */
export function getMinimumEvidenceRequirements() {
  return MINIMUM_EVIDENCE_REQUIREMENTS;
}
