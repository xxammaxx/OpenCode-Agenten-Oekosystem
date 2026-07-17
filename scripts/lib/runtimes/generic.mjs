// SPDX-License-Identifier: MIT
/**
 * Generic Runtime Adapter (Fallback)
 *
 * Used when no specific runtime is detected.
 * Always returns AMBER_REVIEW — unknown runtime means
 * the gate kernel cannot verify runtime-specific properties.
 *
 * The generic adapter applies ALL kernel gates and
 * generic policy gates but cannot validate runtime-specific
 * configurations or perform runtime smoke tests.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAdapterResult, getConfidenceLevel } from './contract.mjs';
import { CLASSIFICATIONS, VERIFICATION_LEVELS } from '../gates/classifications.mjs';

/** @type {string} */
export const ADAPTER_ID = 'generic';

/**
 * Detect if a project matches a generic (unknown) runtime.
 * Always returns AMBER_REVIEW confidence since no specific runtime is identified.
 */
export function detect(context = {}) {
  const targetRoot = context.targetRoot || process.cwd();

  // Generic runtime is always the fallback
  // Check for basic project signals
  const signals = [];
  let confidence = 0;

  const basicSignals = {
    'package.json': 5,
    'README.md': 2,
    'Makefile': 5,
    'pyproject.toml': 5,
    'go.mod': 5,
    'Cargo.toml': 5
  };

  for (const [file, weight] of Object.entries(basicSignals)) {
    if (existsSync(resolve(targetRoot, file))) {
      signals.push({ file, weight });
      confidence = Math.min(confidence + weight, 20); // cap at 20 for generic
    }
  }

  return {
    runtime: ADAPTER_ID,
    confidence: Math.min(confidence, 20),
    confidenceLevel: getConfidenceLevel(confidence),
    signals,
    message: confidence > 0
      ? `Generic project detected (${confidence}% confidence). No specific runtime identified.`
      : 'No project signals detected. Generic fallback.'
  };
}

/**
 * Assess capabilities of a generic (unknown) runtime.
 * Since the runtime is unknown, we assume MINIMAL capabilities.
 */
export function capabilities(context = {}) {
  return createAdapterResult({
    runtime: ADAPTER_ID,
    confidence: 0,
    detectionLevel: 'NOT_DETECTED',
    capabilities: {
      hasCLI: false,
      hasStructuralConfig: false,
      hasLiveTest: false,
      knownPermissionModel: false,
      knownSkillSystem: false,
      knownMCPSupport: false,
      knownAgentSystem: false,
      requiresHandoff: true
    },
    risks: [
      'Unknown runtime — cannot verify runtime-specific security properties.',
      'Assume minimal capabilities — all privileged operations require explicit approval.',
      'No structural config validation possible beyond kernel gates.',
      'No runtime smoke test possible.'
    ]
  });
}

/**
 * Validate a generic project structurally.
 * Only checks that can be performed without runtime-specific knowledge.
 */
export function validate(context = {}) {
  const detection = detect(context);

  return {
    ...detection,
    classification: CLASSIFICATIONS.AMBER_REVIEW,
    verificationLevel: VERIFICATION_LEVELS.NOT_CHECKED,
    findings: [
      {
        type: 'WARNING',
        message: 'Runtime is unknown/generic. Only kernel gates can be verified.'
      }
    ],
    toolGaps: ['UNKNOWN_RUNTIME'],
    warnings: [
      `Unknown runtime: ${context.runtime || 'not specified'}. Full verification not possible.`
    ]
  };
}

/**
 * Evaluate runtime-specific gates for a generic project.
 * Since we don't know the runtime, we can only apply kernel gates.
 */
export function evaluateRuntimeGates(context = {}) {
  return {
    runtime: ADAPTER_ID,
    classification: CLASSIFICATIONS.AMBER_REVIEW,
    verificationLevel: VERIFICATION_LEVELS.NOT_CHECKED,
    blockedBy: [],
    warnings: ['Generic runtime adapter cannot evaluate runtime-specific gates.'],
    toolGaps: ['GENERIC_RUNTIME_NO_SPECIFIC_GATES']
  };
}

/**
 * Generate a handoff for a generic project.
 * Since the runtime is unknown, no specific handoff can be generated.
 */
export function generateHandoff(context = {}) {
  return {
    runtime: ADAPTER_ID,
    canGenerate: false,
    reason: 'Unknown runtime — no specific handoff artifacts can be generated.',
    suggestedAction: 'Identify the runtime and use a specific adapter.'
  };
}

/**
 * Runtime smoke test. Not possible for generic runtime.
 */
export function runtimeSmoke(context = {}) {
  return {
    runtime: ADAPTER_ID,
    passed: false,
    failures: ['RUNTIME_NOT_IDENTIFIED'],
    toolGaps: ['GENERIC_RUNTIME_NO_SMOKE_TEST'],
    verificationLevel: VERIFICATION_LEVELS.TOOL_GAP
  };
}

/**
 * Normalize evidence from a generic project.
 */
export function normalizeEvidence(context = {}) {
  return {
    runtime: ADAPTER_ID,
    verified: [],
    unverified: ['runtime_specific_config', 'runtime_smoke_test', 'agent_permissions', 'skill_config'],
    notes: 'Generic adapter cannot normalize runtime-specific evidence.'
  };
}

// Export the adapter contract implementation
export default {
  id: ADAPTER_ID,
  detect,
  capabilities,
  validate,
  evaluateRuntimeGates,
  generateHandoff,
  runtimeSmoke,
  normalizeEvidence
};
