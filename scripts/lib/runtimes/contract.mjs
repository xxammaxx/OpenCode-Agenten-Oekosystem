// SPDX-License-Identifier: MIT
/**
 * Runtime Adapter Contract
 *
 * Every runtime adapter MUST implement this interface.
 * The kernel enforces that adapters can only ADD restrictions,
 * never WEAKEN them.
 *
 * Contract methods:
 * - detect(context) → { runtime, confidence, signals }
 * - capabilities(context) → { capabilities, risks, structural }
 * - validate(context) → { classification, findings }
 * - evaluateRuntimeGates(context) → { classification, blockedBy, ... }
 * - generateHandoff(context) → { artifacts, notes }
 * - runtimeSmoke(context) → { passed, failures, toolGaps }
 * - normalizeEvidence(context) → { verified, unverified }
 */

import { CLASSIFICATIONS, VERIFICATION_LEVELS } from '../gates/classifications.mjs';

/** Valid runtime identifiers */
export const KNOWN_RUNTIMES = Object.freeze(['generic', 'opencode', 'hermes', 'odysseus']);

/** Runtime detection confidence thresholds */
export const CONFIDENCE_THRESHOLDS = Object.freeze({
  NOT_DETECTED_MAX: 49,   // 0–49: not detected
  AMBER_THRESHOLD: 50,     // 50–79: AMBER_REVIEW
  DETECTED_THRESHOLD: 80   // 80–100: detected
});

/**
 * Normalize a runtime identifier. Returns 'generic' for unknown runtimes.
 */
export function normalizeRuntime(runtime) {
  if (!runtime || typeof runtime !== 'string') return 'generic';
  const lower = runtime.toLowerCase();
  // Case-insensitive matching for all known runtimes
  if (lower === 'opencode') return 'opencode';
  if (lower === 'hermes' || lower === 'hermes_agent' || lower === 'hermes-agent') return 'hermes';
  if (lower === 'odysseus') return 'odysseus';
  if (lower === 'generic') return 'generic';
  return 'generic';
}

/**
 * Determine confidence level threshold.
 */
export function getConfidenceLevel(confidence) {
  if (confidence >= CONFIDENCE_THRESHOLDS.DETECTED_THRESHOLD) return 'DETECTED';
  if (confidence >= CONFIDENCE_THRESHOLDS.AMBER_THRESHOLD) return 'AMBER_REVIEW';
  return 'NOT_DETECTED';
}

/**
 * Create a standard adapter result object.
 */
export function createAdapterResult({ runtime, confidence, detectionLevel, capabilities = {}, risks = [] }) {
  return Object.freeze({
    runtime,
    confidence,
    detectionLevel,
    capabilities: Object.freeze({ ...capabilities }),
    risks: Object.freeze([...risks]),
    verificationLevel: VERIFICATION_LEVELS.NOT_CHECKED,
    classification: CLASSIFICATIONS.GREEN_SAFE,
    toolGaps: [],
    warnings: []
  });
}

/**
 * Validate that an adapter result does NOT attempt to weaken kernel gates.
 * This is called by the kernel after every adapter evaluation.
 *
 * @param {Object} adapterResult - Result from adapter.evaluateRuntimeGates()
 * @param {string[]} kernelGateIds - List of kernel gate IDs that must always pass
 * @returns {{ clean: boolean, violations: Array }}
 */
export function validateAdapterAgainstKernel(adapterResult, kernelGateIds) {
  const violations = [];

  // Check that adapter does not claim GREEN_SAFE when kernel blocked
  if (adapterResult.classification === CLASSIFICATIONS.GREEN_SAFE &&
      adapterResult.kernelBlocked === true) {
    violations.push({
      code: 'ADAPTER_MASKED_KERNEL_BLOCK',
      message: `Adapter claimed ${CLASSIFICATIONS.GREEN_SAFE} but kernel evaluation was RED_BLOCK.`
    });
  }

  // Check that adapter does not reclassify RED_BLOCK to anything else
  if (adapterResult.classification === CLASSIFICATIONS.GREEN_SAFE &&
      adapterResult.hasRedBlockViolations) {
    violations.push({
      code: 'ADAPTER_RECLASSIFIED_RED_BLOCK',
      message: `Adapter reclassified RED_BLOCK violations to ${adapterResult.classification}.`
    });
  }

  // Check that adapter does not claim live verification when none was performed
  if (adapterResult.verificationLevel === VERIFICATION_LEVELS.LIVE_INTEGRATION_PASS &&
      !adapterResult.liveVerificationPerformed) {
    violations.push({
      code: 'ADAPTER_FALSE_LIVE_CLAIM',
      message: 'Adapter claimed LIVE_INTEGRATION_PASS but no live verification was performed.'
    });
  }

  return {
    clean: violations.length === 0,
    violations: Object.freeze(violations)
  };
}
