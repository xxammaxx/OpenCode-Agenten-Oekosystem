// SPDX-License-Identifier: MIT
/**
 * evaluate-all.mjs — Canonical Gate Evaluation Entry Point
 *
 * This is the SINGLE, unified entry point for all gate evaluation.
 * Every runtime, adapter, CLI, installer, and hook MUST use this
 * function to produce gate decisions. No bypass paths allowed.
 *
 * Design invariants:
 * ──────────────────
 * 1. Kernel gates evaluate FIRST, always, never skipped.
 * 2. Policy gates evaluate SECOND (comment policy, etc.).
 * 3. Project gates evaluate THIRD (project-specific policies).
 * 4. Runtime adapter evaluates FOURTH (adds restrictions only).
 * 5. No short-circuit — all layers evaluate even if kernel blocks.
 * 6. RED_BLOCK has absolute priority (kernel enforces this).
 * 7. Runtime adapters may only TIGHTEN, never WEAKEN.
 * 8. Policy may only TIGHTEN, never WEAKEN.
 * 9. Missing evidence prevents GREEN_SAFE.
 * 10. Gate exception for write actions results in RED_BLOCK.
 * 11. Adapter failure does NOT result in implicit allow.
 * 12. Unknown runtime receives NO enforcement claim.
 *
 * Evaluation order:
 *   Kernel Gates → Policy Gates → Project Gates → Adapter Gates → Decision
 *
 * @module evaluate-all
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateKernelGates, detectKernelGateOverrides, getKernelGateIds } from './kernel.mjs';
import { evaluateCommentPolicy } from './policy.mjs';
import { createGateDecision, CLASSIFICATIONS, VERIFICATION_LEVELS, classificationToExitCode, createStructuralDecision } from './decision.mjs';
import { validateClaimEvidence } from './evidence.mjs';
import { validateReceiptStructure, consumeReceipt, getRepositoryContext, VALID_ACTIONS } from './approval.mjs';
import { normalizeRuntime, validateAdapterAgainstKernel, getConfidenceLevel, KNOWN_RUNTIMES } from '../runtimes/contract.mjs';
import * as genericAdapter from '../runtimes/generic.mjs';
import * as opencodeAdapter from '../runtimes/opencode.mjs';
import * as hermesAdapter from '../runtimes/hermes.mjs';
import * as odysseusAdapter from '../runtimes/odysseus.mjs';

// ── Adapter Registry ──────────────────────────────────────────────

const ADAPTERS = {
  generic: genericAdapter,
  opencode: opencodeAdapter,
  hermes: hermesAdapter,
  odysseus: odysseusAdapter
};

// ── Runtime Detection ─────────────────────────────────────────────

function autoDetectRuntimes(targetRoot) {
  const results = [];
  for (const [name, adapter] of Object.entries(ADAPTERS)) {
    if (name === 'generic') continue;
    try {
      const detection = adapter.detect({ targetRoot });
      results.push({ name, confidence: detection.confidence || 0, signals: detection.signals || [] });
    } catch {
      results.push({ name, confidence: 0, signals: [] });
    }
  }
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

function selectAdapter(runtime, targetRoot) {
  if (runtime === 'auto') {
    const detections = autoDetectRuntimes(targetRoot);
    for (const d of detections) {
      if (d.confidence >= 50) {
        return { adapter: ADAPTERS[d.name] || genericAdapter, detectedAs: d.name, confidence: d.confidence, allDetections: detections };
      }
    }
    return { adapter: genericAdapter, detectedAs: 'generic', confidence: 0, allDetections: detections };
  }

  const normalized = normalizeRuntime(runtime);
  const adapter = ADAPTERS[normalized];
  if (!adapter) {
    return { adapter: genericAdapter, detectedAs: 'generic', confidence: 0, allDetections: [], error: `Unknown runtime: "${runtime}"` };
  }
  return { adapter, detectedAs: normalized, confidence: 100, allDetections: [] };
}

// ── Approval Loading ──────────────────────────────────────────────

function loadApprovals(approvalFile, targetRoot) {
  if (!approvalFile) return [];
  try {
    const content = readFileSync(resolve(approvalFile), 'utf-8');
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [data];
  } catch {
    return [];
  }
}

function loadProjectPolicy(policyFile) {
  if (!policyFile) return null;
  try {
    const content = readFileSync(resolve(policyFile), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function loadEvidence(evidenceFile) {
  if (!evidenceFile) return [];
  try {
    const content = readFileSync(resolve(evidenceFile), 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

// ── Main Evaluation Function ──────────────────────────────────────

/**
 * Evaluate ALL gates against a context. This is THE canonical entry point.
 *
 * @param {Object} params
 * @param {string} params.targetRoot - Absolute path to target project root
 * @param {string} [params.runtime='auto'] - Runtime identifier (auto, opencode, hermes, odysseus, generic)
 * @param {string} [params.action='evaluate'] - Action being performed
 * @param {string} [params.tool] - Tool name (e.g., 'bash', 'edit', 'write')
 * @param {Object} [params.toolArgs] - Tool arguments
 * @param {string} [params.command] - The actual command being executed
 * @param {string[]} [params.writePaths=[]] - Paths being written to
 * @param {string} [params.approvalFile] - Path to approval receipt JSON file
 * @param {string} [params.evidenceFile] - Path to evidence collection JSON file
 * @param {string} [params.projectPolicyFile] - Path to project-level gate policy JSON
 * @param {Object} [params.enforcementContext] - Additional enforcement metadata
 * @param {string} [params.riskTier='MEDIUM_REVIEW'] - Risk tier
 * @param {boolean} [params.dryRun=true] - Dry-run mode
 * @param {string} [params.agentRole] - Agent role for comment policy
 * @param {string} [params.worktreeRoot] - Worktree root for path checks
 * @returns {Object} Frozen gate decision object
 */
export async function evaluateAllGates({
  targetRoot,
  runtime = 'auto',
  action = 'evaluate',
  tool = null,
  toolArgs = null,
  command = null,
  writePaths = [],
  approvalFile = null,
  evidenceFile = null,
  projectPolicyFile = null,
  enforcementContext = {},
  riskTier = 'MEDIUM_REVIEW',
  dryRun = true,
  agentRole = null,
  worktreeRoot = null
}) {
  // ── Phase 0: Pre-flight ──────────────────────────────────────────
  const absTarget = resolve(targetRoot);
  if (!existsSync(absTarget)) {
    const decision = createStructuralDecision({
      runtime: 'unknown',
      action,
      riskTier,
      targetRoot: absTarget
    });
    return {
      ...decision,
      classification: CLASSIFICATIONS.RED_BLOCK,
      allowed: false,
      warnings: [...decision.warnings, 'Target directory does not exist.'],
      exitCode: 2
    };
  }

  // Select adapter
  const { adapter, detectedAs, confidence, allDetections } = selectAdapter(runtime, absTarget);

  // ── Phase 1: Load Approvals, Evidence, Project Policy ────────────
  const approvalData = loadApprovals(approvalFile, absTarget);
  const evidenceData = loadEvidence(evidenceFile);
  const projectPolicy = loadProjectPolicy(projectPolicyFile);

  // ── Phase 2: Kernel Gates (FIRST, always, never skipped) ────────
  const kernelCtx = {
    targetRoot: absTarget,
    worktreeRoot: worktreeRoot || absTarget,
    command: command || action,
    action,
    writePath: writePaths.length > 0 ? writePaths[0] : undefined,
    scopePaths: writePaths,
    isRemote: action === 'push' || action === 'deploy' || (command && (command.includes('git push') || command.includes('curl') || command.includes('docker push'))),
    isWrite: action === 'apply' || tool === 'write' || tool === 'edit' || tool === 'bash',
    agentRole,
    agentId: agentRole,
    hasBackup: enforcementContext.hasBackup || false,
    hasValidatedManifest: enforcementContext.hasValidatedManifest || false,
    environment: enforcementContext.environment || undefined,
    ...enforcementContext
  };

  const kernelResult = evaluateKernelGates(kernelCtx);

  // ── Phase 3: Policy Gates (SECOND) ───────────────────────────────
  // Issue fetch is only required when a GitHub comment is being posted.
  // For non-comment operations (tool execution only), the requirement
  // is not applicable — we pass 'yes' to avoid blocking tool operations
  // with COMMENT_ISSUE_NOT_FETCHED. The comment policy evaluator
  // remains unchanged and deterministic.
  const effectiveCommentType = enforcementContext.commentType || 'none';
  const commentPolicyCtx = {
    agentRole: agentRole || 'unknown',
    commentType: effectiveCommentType,
    commentData: enforcementContext.commentData || {},
    issueFetched: effectiveCommentType !== 'none'
      ? (enforcementContext.issueFetched || 'no')
      : 'yes',
    commitSha: enforcementContext.commitSha || null,
    hasExternalReview: enforcementContext.hasExternalReview || false
  };
  const commentPolicyResult = evaluateCommentPolicy(commentPolicyCtx);

  // ── Phase 4: Project Gates (THIRD) ──────────────────────────────
  const projectGatesResult = [];
  if (projectPolicy && typeof projectPolicy === 'object') {
    // Evaluate project-specific gate overrides (tightening only)
    // Project policies are additive — they can only add restrictions
    if (projectPolicy.blockedActions && Array.isArray(projectPolicy.blockedActions)) {
      for (const blockedAction of projectPolicy.blockedActions) {
        if (blockedAction === action || blockedAction === tool) {
          projectGatesResult.push({
            classification: CLASSIFICATIONS.RED_BLOCK,
            verificationLevel: VERIFICATION_LEVELS.STRUCTURAL_PASS,
            blockedBy: [{
              gateId: 'PROJECT_POLICY_BLOCK',
              code: 'PROJECT_POLICY_BLOCK',
              message: `Action "${action}" is blocked by project policy.`,
              layer: 'project'
            }]
          });
        }
      }
    }
    if (projectPolicy.gates && Array.isArray(projectPolicy.gates)) {
      for (const gate of projectPolicy.gates) {
        if (gate.blockedTools && Array.isArray(gate.blockedTools)) {
          if (gate.blockedTools.includes(tool)) {
            projectGatesResult.push({
              classification: CLASSIFICATIONS.RED_BLOCK,
              verificationLevel: VERIFICATION_LEVELS.STRUCTURAL_PASS,
              blockedBy: [{
                gateId: gate.id || 'PROJECT_GATE',
                code: gate.id || 'PROJECT_GATE',
                message: gate.message || `Tool "${tool}" is blocked by project gate.`,
                layer: 'project'
              }]
            });
          }
        }
      }
    }
  }

  // ── Phase 5: Runtime Adapter (FOURTH, additive only) ────────────
  let adapterResult = null;
  let adapterError = null;
  let handoffResult = null;

  try {
    // Validate adapter
    const validation = adapter.validate({ targetRoot: absTarget, runtime: detectedAs, action });
    // Evaluate runtime-specific gates
    const gates = adapter.evaluateRuntimeGates({ targetRoot: absTarget, runtime: detectedAs, action });
    // Get capabilities
    const caps = adapter.capabilities({ targetRoot: absTarget, runtime: detectedAs });

    adapterResult = {
      ...validation,
      blockedBy: gates.blockedBy || [],
      warnings: gates.warnings || [],
      capabilities: (caps && caps.capabilities) || {},
      requiredApprovals: gates.requiredApprovals || [],
      verificationLevel: validation.verificationLevel || VERIFICATION_LEVELS.NOT_CHECKED,
      classification: validation.classification || CLASSIFICATIONS.GREEN_SAFE,
      toolGaps: validation.toolGaps || [],
      liveVerificationPerformed: false
    };
  } catch (e) {
    adapterError = e;
    adapterResult = {
      classification: CLASSIFICATIONS.AMBER_REVIEW,
      verificationLevel: VERIFICATION_LEVELS.TOOL_GAP,
      toolGaps: ['ADAPTER_EVALUATION_FAILED'],
      warnings: [e.message],
      capabilities: {},
      requiredApprovals: [],
      blockedBy: []
    };
  }

  // ── Phase 5b: Adapter Kernel Override Detection ─────────────────
  // This runs AFTER adapter evaluation so adapterResult is available
  const adapterOverrideCheck = detectKernelGateOverrides({
    runtimeGates: adapterResult ? adapterResult.blockedBy || [] : [],
    kernelViolations: kernelResult.violations || [],
    adapterClassification: adapterResult?.classification || CLASSIFICATIONS.GREEN_SAFE,
    kernelClassification: kernelResult.classification || CLASSIFICATIONS.GREEN_SAFE
  });

  // Validate adapter against kernel (catch false live claims, masked blocks, etc.)
  const kernelValidation = validateAdapterAgainstKernel(adapterResult, getKernelGateIds());

  // Add kernel validation violations as additional blocks
  if (!kernelValidation.clean) {
    for (const violation of kernelValidation.violations) {
      adapterResult.blockedBy = [
        ...(adapterResult.blockedBy || []),
        { layer: 'kernel_validation', code: violation.code, message: violation.message }
      ];
    }
    // Downgrade classification if adapter was masking a kernel issue
    if (adapterResult.classification === CLASSIFICATIONS.GREEN_SAFE) {
      adapterResult.classification = CLASSIFICATIONS.AMBER_REVIEW;
    }
  }

  // ── Phase 6: Handoff (for Odysseus/generic) ─────────────────────
  if (detectedAs === 'odysseus' || detectedAs === 'generic') {
    try {
      handoffResult = adapter.generateHandoff({ targetRoot: absTarget, runtime: detectedAs });
    } catch {
      handoffResult = { canGenerate: false, notes: ['Handoff generation failed'] };
    }
  }

  // ── Phase 7: Validate and consume approvals ─────────────────────
  const consumedApprovals = [];
  const approvalIssues = [];
  const validApprovals = [];
  let repositoryContext = null;
  try {
    repositoryContext = getRepositoryContext(absTarget);
  } catch {
    repositoryContext = {
      repository_identity: `local:${absTarget}`,
      project_path: absTarget,
      branch: null,
      head: null
    };
  }

  for (const approval of approvalData) {
    const structIssues = validateReceiptStructure(approval);
    if (structIssues.length > 0) {
      approvalIssues.push({ nonce: approval.nonce || 'unknown', issues: structIssues });
      continue;
    }

    if (approval.status === 'APPROVED') {
      try {
        const consumed = consumeReceipt(approval, {
          action,
          runtime: detectedAs,
          repository_identity: enforcementContext.repository_identity || repositoryContext.repository_identity,
          project_path: enforcementContext.project_path || repositoryContext.project_path,
          branch: enforcementContext.branch || enforcementContext.gitBranch || repositoryContext.branch,
          head: enforcementContext.head || enforcementContext.gitCommit || repositoryContext.head,
          phase: enforcementContext.phase || 'before-implement',
          risk_tier: enforcementContext.risk_tier || enforcementContext.riskTier || riskTier,
          scope: enforcementContext.scope || writePaths,
          policyFile: enforcementContext.policyFile,
          baseDir: absTarget
        });
        consumedApprovals.push(consumed);
        validApprovals.push(approval);
      } catch (e) {
        approvalIssues.push({
          nonce: approval.nonce,
          issues: [{ field: 'consume', issue: e.code || 'CONSUME_FAILED', message: e.message }]
        });
      }
    } else if (approval.status === 'CONSUMED') {
      // Already consumed — track but don't re-consume
      consumedApprovals.push(approval);
      approvalIssues.push({
        nonce: approval.nonce,
        issues: [{ field: 'status', issue: 'ALREADY_CONSUMED' }]
      });
    } else if (approval.status === 'EXPIRED' || approval.status === 'DENIED') {
      approvalIssues.push({
        nonce: approval.nonce,
        issues: [{ field: 'status', issue: `STATUS_${approval.status}` }]
      });
    }
  }

  const approvalPolicyResult = approvalIssues.length > 0
    ? {
        classification: CLASSIFICATIONS.RED_BLOCK,
        verificationLevel: VERIFICATION_LEVELS.FAILED,
        blockedBy: approvalIssues.map((entry) => ({
          gateId: 'NO_APPROVAL_RECEIPT',
          code: entry.issues?.[0]?.issue || 'APPROVAL_RECEIPT_INVALID',
          message: 'Approval receipt was rejected by the canonical receipt contract.',
          layer: 'approval',
          evidence: { nonce: entry.nonce || 'unknown' }
        }))
      }
    : {
        classification: CLASSIFICATIONS.GREEN_SAFE,
        verificationLevel: VERIFICATION_LEVELS.STRUCTURAL_PASS,
        blockedBy: []
      };

  // ── Phase 8: Validate evidence ──────────────────────────────────
  const evidenceValidation = evidenceData.length > 0
    ? validateClaimEvidence('verification_contract', evidenceData.map(e => e.type || 'unknown'), null)
    : { valid: false, missing: ['no_evidence_provided'], fallbackStatus: 'PENDING_SPEC' };

  // ── Phase 9: Assemble decision ───────────────────────────────────
  // Combine all policy results (comment policy + project gates)
  const policyResults = [
    {
      classification: commentPolicyResult.classification,
      verificationLevel: VERIFICATION_LEVELS.STRUCTURAL_PASS,
      blockedBy: commentPolicyResult.violations.map(v => ({
        gateId: v.code,
        code: v.code,
        message: v.message,
        layer: 'policy'
      }))
    },
    approvalPolicyResult,
    ...projectGatesResult
  ];

  // Build metadata
  const metadata = {
    confidence,
    dryRun,
    handoff: handoffResult,
    requiredEvidence: evidenceValidation.missing.length > 0
      ? evidenceValidation.requirements || [] : [],
    presentEvidence: evidenceData.map(e => e.type || 'unknown').filter(Boolean),
    allDetections,
    adapterError: adapterError ? adapterError.message : null,
    kernelOverrideDetected: !adapterOverrideCheck.clean,
    kernelOverrides: adapterOverrideCheck.overrides || [],
    adapterValidAgainstKernel: kernelValidation.clean
  };

  const decision = createGateDecision({
    runtime: detectedAs,
    action,
    riskTier,
    kernelResult,
    policyResults,
    projectResults: projectGatesResult,
    adapterResult,
    approvals: validApprovals,
    targetRoot: absTarget,
    metadata
  });

  // Add approval consumption info
  return Object.freeze({
    ...decision,
    consumedApprovals: Object.freeze(consumedApprovals),
    approvalIssues: Object.freeze(approvalIssues),
    evidenceValidation: Object.freeze(evidenceValidation),
    handoff: handoffResult,
    adapterSelection: Object.freeze({
      detectedAs,
      confidence,
      allDetections: Object.freeze(allDetections)
    })
  });
}

/**
 * Synchronous wrapper for evaluateAllGates (for use in non-async contexts).
 * Same contract, same evaluation order.
 */
export function evaluateAllGatesSync(params) {
  // evaluateAllGates is currently synchronous (loadApprovals/loadPolicy are sync)
  // The async wrapper exists for future async evidence loading
  return evaluateAllGates(params);
}

// Re-export commonly needed symbols for convenience
export {
  CLASSIFICATIONS,
  VERIFICATION_LEVELS,
  classificationToExitCode,
  VALID_ACTIONS,
  KNOWN_RUNTIMES
};
