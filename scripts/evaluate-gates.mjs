#!/usr/bin/env node
/**
 * evaluate-gates.mjs — Runtime-Neutral Gate Evaluation CLI
 *
 * Evaluates kernel gates, policy gates, and project gates
 * against a target project with the specified runtime adapter.
 *
 * Usage:
 *   node scripts/evaluate-gates.mjs --target /path/to/project --runtime auto --action apply
 *   node scripts/evaluate-gates.mjs --target . --runtime odysseus --action push --dry-run
 *   node scripts/evaluate-gates.mjs --target . --runtime auto --json
 *
 * Exit codes:
 *   0 = GREEN_SAFE
 *   1 = AMBER_REVIEW or TOOL_GAP
 *   2 = RED_BLOCK
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { evaluateKernelGates, detectKernelGateOverrides } from './lib/gates/kernel.mjs';
import { createGateDecision, CLASSIFICATIONS, VERIFICATION_LEVELS, classificationToExitCode } from './lib/gates/decision.mjs';
import { normalizeRuntime, validateAdapterAgainstKernel, getConfidenceLevel, KNOWN_RUNTIMES } from './lib/runtimes/contract.mjs';
import { VALID_ACTIONS } from './lib/gates/approval.mjs';
import * as genericAdapter from './lib/runtimes/generic.mjs';
import * as opencodeAdapter from './lib/runtimes/opencode.mjs';
import * as hermesAdapter from './lib/runtimes/hermes.mjs';
import * as odysseusAdapter from './lib/runtimes/odysseus.mjs';

// ── Adapter Registry ──────────────────────────────────────────────

const ADAPTERS = {
  generic: genericAdapter,
  opencode: opencodeAdapter,
  hermes: hermesAdapter,
  odysseus: odysseusAdapter
};

// ── CLI Argument Parsing ──────────────────────────────────────────

function parseArgs(args) {
  const parsed = {
    target: process.cwd(),
    runtime: 'auto',
    action: 'evaluate',
    riskTier: 'MEDIUM_REVIEW',
    dryRun: true,
    json: false,
    approvalFile: null,
    evidenceFile: null,
    projectPolicy: null,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--target':
        parsed.target = args[++i] || parsed.target;
        break;
      case '--runtime':
        parsed.runtime = args[++i] || 'auto';
        break;
      case '--action':
        parsed.action = args[++i] || 'evaluate';
        break;
      case '--risk-tier':
        parsed.riskTier = args[++i] || 'MEDIUM_REVIEW';
        break;
      case '--apply':
        parsed.dryRun = false;
        break;
      case '--dry-run':
        parsed.dryRun = true;
        break;
      case '--json':
        parsed.json = true;
        break;
      case '--approval-file':
        parsed.approvalFile = args[++i];
        break;
      case '--evidence-file':
        parsed.evidenceFile = args[++i];
        break;
      case '--project-policy':
        parsed.projectPolicy = args[++i];
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`evaluate-gates.mjs — Runtime-Neutral Gate Evaluation CLI

Usage:
  node scripts/evaluate-gates.mjs [options]

Options:
  --target <path>      Target project root (default: current directory)
  --runtime <runtime>  Runtime adapter: auto, generic, opencode, hermes, odysseus (default: auto)
  --action <action>    Action to evaluate: apply, push, commit, merge, deploy (default: evaluate)
  --risk-tier <tier>   Risk tier: LOW_LOCAL, MEDIUM_REVIEW, HIGH_HUMAN_GATE, CRITICAL_BLOCK
  --apply              Execute (default is dry-run)
  --dry-run            Dry-run mode (default)
  --json               Output JSON decision object
  --approval-file <f>  Path to approval receipt JSON
  --evidence-file <f>  Path to evidence collection JSON
  --project-policy <f> Path to project-level gate policy JSON
  --help, -h           Show this help

Exit Codes:
  0  GREEN_SAFE — all gates passed
  1  AMBER_REVIEW or TOOL_GAP — review required
  2  RED_BLOCK — kernel gate violation`);
}

// ── Auto-Detect Runtime ────────────────────────────────────────────

function autoDetectRuntimes(targetRoot) {
  const results = [];
  for (const [name, adapter] of Object.entries(ADAPTERS)) {
    if (name === 'generic') continue; // skip generic — it's the fallback
    const detection = adapter.detect({ targetRoot });
    results.push({ name, ...detection });
  }

  // Sort by confidence descending
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
    // Fallback to generic
    return { adapter: genericAdapter, detectedAs: 'generic', confidence: 0, allDetections: detections };
  }

  const normalized = normalizeRuntime(runtime);
  const adapter = ADAPTERS[normalized];
  if (!adapter) {
    console.error(`Unknown runtime: "${runtime}". Valid: auto, ${KNOWN_RUNTIMES.join(', ')}`);
    process.exit(2);
  }
  return { adapter, detectedAs: normalized, confidence: 100, allDetections: [] };
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const targetRoot = resolve(args.target);
  if (!existsSync(targetRoot)) {
    console.error(`Target directory does not exist: ${targetRoot}`);
    process.exit(2);
  }

  // Validate action against known valid actions
  const VALID_CLI_ACTIONS = new Set([
    ...VALID_ACTIONS, 'evaluate', 'review', 'validate', 'check', 'scan'
  ]);
  if (!VALID_CLI_ACTIONS.has(args.action)) {
    console.error(`Invalid action: "${args.action}". Valid actions: ${[...VALID_CLI_ACTIONS].sort().join(', ')}`);
    process.exit(2);
  }

  // Select adapter
  const { adapter, detectedAs, confidence } = selectAdapter(args.runtime, targetRoot);

  if (!args.json) {
    console.log(`\n═══ Gate Evaluation ═══`);
    console.log(`Target:  ${targetRoot}`);
    console.log(`Runtime: ${detectedAs} (confidence: ${confidence}%)`);
    console.log(`Action:  ${args.action}`);
    console.log(`Tier:    ${args.riskTier}`);
    console.log(`Mode:    ${args.dryRun ? 'DRY-RUN' : 'APPLY'}`);
    console.log('');
  }

  // Phase 1: Kernel Gates (always evaluated first, never skipped)
  const kernelCtx = {
    targetRoot,
    command: args.action,
    action: args.action
  };
  const kernelResult = evaluateKernelGates(kernelCtx);

  // Detect kernel gate overrides in adapter
  const adapterOverrideCheck = detectKernelGateOverrides({
    runtimeGates: adapterResult ? adapterResult.blockedBy || [] : [],
    kernelViolations: kernelResult.violations || [],
    adapterClassification: adapterResult?.classification || CLASSIFICATIONS.GREEN_SAFE,
    kernelClassification: kernelResult.classification || CLASSIFICATIONS.GREEN_SAFE
  });

  if (!adapterOverrideCheck.clean && !args.json) {
    console.log(`\n⚠️  Adapter Kernel Override Detected:`);
    for (const override of adapterOverrideCheck.overrides || []) {
      console.log(`    ❌ ${override.type || 'UNKNOWN'}: ${override.message || 'adapter override detected'}`);
    }
  }

  if (!args.json) {
    console.log(`Kernel Gates: ${kernelResult.passedGateCount}/${kernelResult.kernelGateCount} passed`);
    if (kernelResult.violations.length > 0) {
      console.log(`  BLOCKED by ${kernelResult.violations.length} gate(s):`);
      for (const v of kernelResult.violations) {
        console.log(`    ❌ ${v.code || v.gateId}: ${v.message}`);
      }
    } else {
      console.log(`  ✅ All kernel gates passed.`);
    }
  }

  // Phase 2: Runtime Adapter Evaluation
  let adapterResult = null;
  try {
    const validation = adapter.validate({ targetRoot, runtime: detectedAs, action: args.action });
    const gates = adapter.evaluateRuntimeGates({ targetRoot, runtime: detectedAs, action: args.action });
    const caps = adapter.capabilities({ targetRoot, runtime: detectedAs });

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

    // Validate adapter against kernel (detect adapter overrides)
    const kernelCheck = validateAdapterAgainstKernel(adapterResult, []);
    if (!kernelCheck.clean) {
      for (const violation of kernelCheck.violations) {
        if (!args.json) {
          console.log(`\n⚠️  Adapter Kernel Violation: ${violation.message}`);
        }
      }
    }

    if (!args.json) {
      console.log(`\nRuntime Adapter (${detectedAs}):`);
      console.log(`  Classification:    ${adapterResult.classification}`);
      console.log(`  Verification:      ${adapterResult.verificationLevel}`);
      if (adapterResult.warnings && adapterResult.warnings.length > 0) {
        console.log(`  Warnings:          ${adapterResult.warnings.length}`);
        for (const w of adapterResult.warnings) {
          console.log(`    ⚠️  ${w}`);
        }
      }
      if (adapterResult.blockedBy && adapterResult.blockedBy.length > 0) {
        console.log(`  Blocked By:`);
        for (const b of adapterResult.blockedBy) {
          console.log(`    ❌ [${b.layer}] ${b.message}`);
        }
      }
    }
  } catch (e) {
    if (!args.json) {
      console.log(`\n⚠️  Adapter evaluation failed: ${e.message}`);
    }
    adapterResult = {
      classification: CLASSIFICATIONS.AMBER_REVIEW,
      verificationLevel: VERIFICATION_LEVELS.TOOL_GAP,
      toolGaps: ['ADAPTER_EVALUATION_FAILED'],
      warnings: [e.message],
      capabilities: {}
    };
  }

  // Phase 3: Handoff Check (for Odysseus and unknown runtimes)
  let handoffResult = null;
  if (detectedAs === 'odysseus' || detectedAs === 'generic') {
    handoffResult = adapter.generateHandoff({ targetRoot, runtime: detectedAs });
    if (!args.json && handoffResult.canGenerate) {
      console.log(`\nHandoff (${detectedAs}):`);
      console.log(`  Type:              ${handoffResult.handoffType || 'N/A'}`);
      console.log(`  Native Integration: ${handoffResult.nativeIntegration !== undefined ? handoffResult.nativeIntegration : 'N/A'}`);
      if (handoffResult.artifacts) {
        console.log(`  Artifacts:         ${handoffResult.artifacts.length}`);
        for (const a of handoffResult.artifacts) {
          console.log(`    📄 ${a.path} (${a.type})`);
        }
      }
      if (handoffResult.notes) {
        for (const n of handoffResult.notes) {
          console.log(`    ℹ️  ${n}`);
        }
      }
    }
  }

  // Phase 4: Load approvals if provided
  let approvals = [];
  if (args.approvalFile) {
    try {
      const { readFileSync } = await import('node:fs');
      const content = readFileSync(resolve(args.approvalFile), 'utf-8');
      const approvalData = JSON.parse(content);
      if (Array.isArray(approvalData)) {
        approvals = approvalData;
      } else {
        approvals = [approvalData];
      }
    } catch (e) {
      if (!args.json) {
        console.log(`\n⚠️  Could not load approval file: ${e.message}`);
      }
    }
  }

  // Phase 5: Create final decision
  const decision = createGateDecision({
    runtime: detectedAs,
    action: args.action,
    riskTier: args.riskTier,
    kernelResult: {
      allowed: kernelResult.allowed,
      violations: kernelResult.violations,
      classification: kernelResult.classification
    },
    policyResults: [],
    projectResults: [],
    adapterResult: {
      classification: adapterResult.classification,
      verificationLevel: adapterResult.verificationLevel,
      capabilities: adapterResult.capabilities,
      toolGaps: adapterResult.toolGaps,
      warnings: adapterResult.warnings,
      blockedBy: adapterResult.blockedBy,
      requiredApprovals: adapterResult.requiredApprovals || []
    },
    approvals,
    targetRoot,
    metadata: {
      confidence,
      dryRun: args.dryRun,
      handoff: handoffResult
    }
  });

  // Output
  if (args.json) {
    console.log(JSON.stringify(decision, null, 2));
  } else {
    console.log(`\n═══ Decision ═══`);
    const icon = decision.classification === CLASSIFICATIONS.GREEN_SAFE ? '✅' :
                 decision.classification === CLASSIFICATIONS.AMBER_REVIEW ? '⚠️' :
                 decision.classification === CLASSIFICATIONS.TOOL_GAP ? '🔧' : '🚫';
    console.log(`  ${icon} Classification:  ${decision.classification}`);
    console.log(`  Allowed:            ${decision.allowed}`);
    console.log(`  Verification:       ${decision.verificationLevel}`);
    console.log(`  Exit Code:          ${decision.exitCode}`);

    if (decision.warnings.length > 0) {
      console.log(`  Warnings:           ${decision.warnings.length}`);
    }
    if (decision.blockedBy.length > 0) {
      console.log(`\n  Blocked by ${decision.blockedBy.length} item(s):`);
      for (const b of decision.blockedBy) {
        console.log(`    [${b.layer}] ${b.message}`);
      }
    }
    if (decision.requiredApprovals.length > 0) {
      console.log(`\n  Required Approvals: ${decision.requiredApprovals.length}`);
      for (const ra of decision.requiredApprovals) {
        console.log(`    🔒 ${ra.type} (gate: ${ra.gate})`);
      }
    }
    if (decision.toolGaps.length > 0) {
      console.log(`\n  Tool Gaps: ${decision.toolGaps.length}`);
      for (const tg of decision.toolGaps) {
        console.log(`    🔧 ${tg}`);
      }
    }
    console.log('');
  }

  process.exit(decision.exitCode);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(2);
});
