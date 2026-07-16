/**
 * Gate Decision Contract
 *
 * Produces a machine-readable JSON decision object from kernel,
 * policy, and project gate evaluations. This is the canonical
 * output format — every runtime, every adaptor, every CLI produces
 * decisions in this schema.
 *
 * Decision properties:
 * - classification: GREEN_SAFE | AMBER_REVIEW | RED_BLOCK | TOOL_GAP
 * - verification_level: NOT_CHECKED | STRUCTURAL_PASS | ... | FAILED
 * - allowed: boolean (true only when GREEN_SAFE)
 * - blocked_by: Array of gate violations that blocked the operation
 * - required_approvals: Approvals needed for the action
 * - consumed_approvals: Approvals that were validated and consumed
 * - required_evidence: Evidence types required
 * - present_evidence: Evidence types present
 * - warnings: Non-blocking concerns
 * - tool_gaps: Missing tools that prevent full verification
 */

import { CLASSIFICATIONS, VERIFICATION_LEVELS, resolveClassification, classificationToExitCode, deepFreeze } from './classifications.mjs';
import { evaluateKernelGates, getKernelGateIds, detectKernelGateOverrides } from './kernel.mjs';
import { validateReceiptStructure } from './approval.mjs';
import { validateClaimEvidence } from './evidence.mjs';

/**
 * Create a gate decision from evaluation results.
 *
 * @param {Object} params
 * @param {string} params.runtime - Runtime identifier (opencode, hermes, odysseus, generic, unknown)
 * @param {string} params.action - Action being performed
 * @param {string} params.riskTier - Risk tier from canonical working method
 * @param {Object} params.kernelResult - Result from evaluateKernelGates()
 * @param {Array} params.policyResults - Results from policy gate evaluations
 * @param {Array} params.projectResults - Results from project gate evaluations
 * @param {Object} params.adapterResult - Results from the runtime adapter
 * @param {Array} params.approvals - Approval receipts to validate
 * @param {string} params.targetRoot - Target project root
 * @param {Object} [params.metadata] - Additional metadata
 * @returns {Object} Frozen gate decision object
 */
export function createGateDecision({
  runtime,
  action,
  riskTier,
  kernelResult,
  policyResults = [],
  projectResults = [],
  adapterResult = null,
  approvals = [],
  targetRoot,
  metadata = {}
}) {
  // Validate kernel result
  if (!kernelResult) {
    kernelResult = { allowed: true, violations: [], classification: CLASSIFICATIONS.GREEN_SAFE };
  }

  // Combine all results for classification resolution
  const allResults = [
    { classification: kernelResult.classification || CLASSIFICATIONS.GREEN_SAFE, verificationLevel: kernelResult.allowed ? VERIFICATION_LEVELS.STRUCTURAL_PASS : VERIFICATION_LEVELS.FAILED },
    ...policyResults.map(r => ({ classification: r.classification || CLASSIFICATIONS.AMBER_REVIEW, verificationLevel: r.verificationLevel || VERIFICATION_LEVELS.NOT_CHECKED })),
    ...projectResults.map(r => ({ classification: r.classification || CLASSIFICATIONS.AMBER_REVIEW, verificationLevel: r.verificationLevel || VERIFICATION_LEVELS.NOT_CHECKED })),
    ...(adapterResult ? [{ classification: adapterResult.classification || CLASSIFICATIONS.GREEN_SAFE, verificationLevel: adapterResult.verificationLevel || VERIFICATION_LEVELS.NOT_CHECKED }] : [])
  ];

  const { classification, verificationLevel } = resolveClassification(allResults);
  const allowed = classification === CLASSIFICATIONS.GREEN_SAFE;

  // Collect blocked-by reasons
  const blockedBy = [];
  if (!kernelResult.allowed) {
    for (const violation of (kernelResult.violations || [])) {
      blockedBy.push({
        gateId: violation.gateId || violation.code,
        code: violation.code,
        message: violation.message || violation.toString(),
        layer: 'kernel',
        evidence: violation.evidence || {}
      });
    }
  }

  for (const pr of policyResults) {
    if (pr.classification !== CLASSIFICATIONS.GREEN_SAFE && pr.blockedBy) {
      for (const block of pr.blockedBy) {
        blockedBy.push({ ...block, layer: 'policy' });
      }
    }
  }

  for (const pr of projectResults) {
    if (pr.classification !== CLASSIFICATIONS.GREEN_SAFE && pr.blockedBy) {
      for (const block of pr.blockedBy) {
        blockedBy.push({ ...block, layer: 'project' });
      }
    }
  }

  // Validate approvals
  const requiredApprovals = determineRequiredApprovals(action, riskTier, adapterResult);
  const consumedApprovals = [];
  const approvalIssues = [];

  for (const approval of approvals) {
    const structureIssues = validateReceiptStructure(approval);
    if (structureIssues.length > 0) {
      approvalIssues.push({ nonce: approval.nonce, issues: structureIssues });
    } else if (approval.status === 'APPROVED' || approval.status === 'CONSUMED') {
      consumedApprovals.push({
        action: approval.action,
        nonce: approval.nonce,
        status: approval.status,
        consumedAt: approval.consumedAt || null,
        expiresAt: approval.expiresAt
      });
    }
  }

  // Tool gaps
  const toolGaps = [];
  if (adapterResult && adapterResult.toolGaps) {
    for (const gap of adapterResult.toolGaps) {
      toolGaps.push(gap);
    }
  }

  // Warnings
  const warnings = [];
  if (verificationLevel === VERIFICATION_LEVELS.NOT_CHECKED) {
    warnings.push('Verification level is NOT_CHECKED — no structural or runtime checks were performed.');
  }
  if (verificationLevel === VERIFICATION_LEVELS.STRUCTURAL_PASS) {
    warnings.push('Verification is STRUCTURAL_PASS only — no live runtime checks were executed.');
  }
  if (toolGaps.length > 0) {
    warnings.push(`${toolGaps.length} tool gap(s) detected — full verification not possible.`);
  }

  // Runtime capabilities from adapter
  const runtimeCapabilities = adapterResult && adapterResult.capabilities
    ? adapterResult.capabilities
    : {};

  // Build the decision object
  const decision = {
    classification,
    runtime: runtime || 'unknown',
    verificationLevel,
    allowed,
    action,
    riskTier: riskTier || 'UNASSIGNED',
    blockedBy: Object.freeze(blockedBy),
    requiredApprovals: Object.freeze(requiredApprovals),
    consumedApprovals: Object.freeze(consumedApprovals),
    approvalIssues: Object.freeze(approvalIssues),
    requiredEvidence: metadata.requiredEvidence || [],
    presentEvidence: metadata.presentEvidence || [],
    runtimeCapabilities: Object.freeze(runtimeCapabilities),
    warnings: Object.freeze(warnings),
    toolGaps: Object.freeze(toolGaps),
    targetRoot: targetRoot || '',
    exitCode: classificationToExitCode(classification),
    decisionTimestamp: new Date().toISOString()
  };

  // Deep-freeze the entire decision to prevent mutation
  return deepFreeze(decision);
}

/**
 * Determine which approvals are required for a given action and risk tier.
 */
function determineRequiredApprovals(action, riskTier, adapterResult) {
  const required = [];

  // Base: all actions need at least structural validation
  required.push({ type: 'structural_validation', required: true });

  // Risk-tier-based requirements
  switch (riskTier) {
    case 'HIGH_HUMAN_GATE':
      required.push({ type: 'owner_approval', required: true, gate: 'human' });
      required.push({ type: 'security_screening', required: true });
      required.push({ type: 'compliance_screening', required: true });
      break;
    case 'MEDIUM_REVIEW':
      required.push({ type: 'peer_review', required: true });
      break;
    case 'CRITICAL_BLOCK':
      required.push({ type: 'blocker_resolution', required: true, gate: 'blocker' });
      break;
    default: // LOW_LOCAL
      break;
  }

  // Action-specific requirements
  if (action === 'push') {
    required.push({ type: 'push_approval', required: true, gate: 'push' });
  }
  if (action === 'apply') {
    required.push({ type: 'apply_approval', required: true, gate: 'apply' });
    required.push({ type: 'backup_confirmation', required: true });
  }
  if (action === 'merge') {
    required.push({ type: 'merge_approval', required: true, gate: 'merge' });
  }

  // Runtime-specific (from adapter)
  if (adapterResult && adapterResult.requiredApprovals) {
    for (const ra of adapterResult.requiredApprovals) {
      if (!required.some(r => r.type === ra.type)) {
        required.push(ra);
      }
    }
  }

  return required;
}

/**
 * Create a minimal decision for structural-only validations.
 */
export function createStructuralDecision({ runtime, action, riskTier, targetRoot }) {
  return createGateDecision({
    runtime,
    action,
    riskTier,
    kernelResult: { allowed: true, violations: [], classification: CLASSIFICATIONS.GREEN_SAFE },
    policyResults: [],
    projectResults: [],
    approvals: [],
    targetRoot,
    metadata: {
      requiredEvidence: ['structural_check', 'config_validation'],
      presentEvidence: []
    }
  });
}

/**
 * Create a decision reflecting a RED_BLOCK from kernel evaluation.
 */
export function createBlockedDecision({ runtime, action, riskTier, targetRoot, kernelResult, reason }) {
  return createGateDecision({
    runtime,
    action,
    riskTier,
    kernelResult,
    approvals: [],
    targetRoot,
    metadata: {
      blockReason: reason || 'Kernel gate violation'
    }
  });
}

export { CLASSIFICATIONS, VERIFICATION_LEVELS, classificationToExitCode };
