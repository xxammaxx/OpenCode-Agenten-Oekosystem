// SPDX-License-Identifier: MIT
/**
 * Hermes Agent Runtime Adapter
 *
 * Detects Hermes from filesystem signals:
 * - .hermes.md in project root
 * - .hermes/ directory with skills/, skill-bundles/, etc.
 * - ~/.hermes/config.yaml (global install)
 * - ~/.hermes/state.db (has run)
 *
 * Key gates:
 * - skills.write_approval check
 * - memory.write_approval check
 * - MCP toolfilter: default deny
 * - /yolo bypass detection and blocking
 * - External skill directories write-protection
 * - MCP sampling control
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createAdapterResult, getConfidenceLevel, CONFIDENCE_THRESHOLDS } from './contract.mjs';
import { CLASSIFICATIONS, VERIFICATION_LEVELS } from '../gates/classifications.mjs';

/** @type {string} */
export const ADAPTER_ID = 'hermes';

const HERMES_HOME = process.env.HERMES_HOME || resolve(process.env.HOME || '/home', '.hermes');

// ── Detection ─────────────────────────────────────────────────────

export function detect(context = {}) {
  const targetRoot = context.targetRoot || process.cwd();
  const signals = [];
  let projectConfidence = 0;
  let globalConfidence = 0;

  // ── Primary project signals ────────────────────────────────────
  if (existsSync(resolve(targetRoot, '.hermes.md'))) {
    signals.push({ signal: '.hermes.md (project)', weight: 35 });
    projectConfidence += 35;
  }

  if (existsSync(resolve(targetRoot, '.hermes'))) {
    const hermesDir = resolve(targetRoot, '.hermes');
    try {
      const entries = readdirSync(hermesDir);
      if (entries.includes('skill-bundles')) {
        signals.push({ signal: '.hermes/skill-bundles/', weight: 20 });
        projectConfidence += 20;
      }
      if (entries.includes('skills')) {
        signals.push({ signal: '.hermes/skills/', weight: 15 });
        projectConfidence += 15;
      }
      if (entries.includes('mcp')) {
        signals.push({ signal: '.hermes/mcp/', weight: 10 });
        projectConfidence += 10;
      }
    } catch { /* cannot read */ }
  }

  // ── Global install signals ─────────────────────────────────────
  if (existsSync(resolve(HERMES_HOME, 'config.yaml'))) {
    signals.push({ signal: 'hermes config.yaml (global)', weight: 25 });
    globalConfidence += 25;
  }
  if (existsSync(resolve(HERMES_HOME, 'state.db'))) {
    signals.push({ signal: 'hermes state.db (has run)', weight: 15 });
    globalConfidence += 15;
  }
  if (existsSync(resolve(HERMES_HOME, 'skills'))) {
    signals.push({ signal: 'hermes skills/ (global)', weight: 10 });
    globalConfidence += 10;
  }

  // ── Hermes-specific config in project files ────────────────────
  const configPath = resolve(targetRoot, '.hermes', 'config.example.yaml');
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      if (content.includes('write_approval') || content.includes('canonical-working-method')) {
        signals.push({ signal: 'hermes config with write_approval', weight: 5 });
        projectConfidence += 5;
      }
    } catch { /* skip */ }
  }

  // ── Project-Local Signal Gate ──────────────────────────────────
  // ADR-006: Global signals alone must NOT trigger auto-detection.
  // At least one project-local signal is required before the
  // combined confidence can reach AMBER_THRESHOLD (50).
  let confidence = projectConfidence + globalConfidence;

  if (projectConfidence === 0) {
    // No project-local Hermes signals → cap below detection threshold.
    // Global signals still appear in `signals` for diagnostics.
    confidence = Math.min(confidence, CONFIDENCE_THRESHOLDS.AMBER_THRESHOLD - 1);
  }

  confidence = Math.min(confidence, 100);

  return {
    runtime: ADAPTER_ID,
    confidence,
    confidenceLevel: getConfidenceLevel(confidence),
    signals,
    message: confidence >= 80
      ? `Hermes Agent detected with ${confidence}% confidence.`
      : confidence >= 50
        ? `Possible Hermes project (${confidence}% confidence).`
        : 'Hermes Agent not detected.'
  };
}

// ── Capabilities ──────────────────────────────────────────────────

export function capabilities(context = {}) {
  const detection = detect(context);

  return createAdapterResult({
    runtime: ADAPTER_ID,
    confidence: detection.confidence,
    detectionLevel: detection.confidenceLevel,
    capabilities: {
      hasCLI: true,
      hasStructuralConfig: detection.confidence >= 50,
      hasLiveTest: true,
      knownPermissionModel: true,
      knownSkillSystem: true,
      knownMCPSupport: true,
      knownAgentSystem: false, // Hermes uses OpenCode policies
      requiresHandoff: false,
      configFormat: 'yaml',
      supportsSkillBundles: true,
      supportsExternalSkills: true
    },
    risks: [
      'skills.write_approval may be false (default) — explicit true required.',
      'memory.write_approval may be false (default) — explicit true required.',
      '/yolo bypass can disable all approval prompts — must be blocked.',
      'External skill directories are NOT a write-protection boundary.',
      'MCP sampling defaults to enabled — must be explicitly disabled for untrusted servers.',
      'approvals.mode: off is equivalent to permanent /yolo.'
    ]
  });
}

// ── Validation ────────────────────────────────────────────────────

export function validate(context = {}) {
  const targetRoot = context.targetRoot || process.cwd();
  const findings = [];
  const warnings = [];

  // Check project-level Hermes config
  const configCandidates = [
    resolve(targetRoot, '.hermes', 'config.example.yaml'),
    resolve(targetRoot, '.hermes.md')
  ];

  let configContent = '';
  for (const candidate of configCandidates) {
    if (existsSync(candidate)) {
      try {
        configContent += readFileSync(candidate, 'utf-8');
      } catch { /* skip */ }
    }
  }

  // Check global Hermes config if available (without reading secrets)
  const globalConfig = resolve(HERMES_HOME, 'config.yaml');
  if (existsSync(globalConfig)) {
    try {
      const content = readFileSync(globalConfig, 'utf-8');
      // Only check security-relevant keys (not the full config)
      if (content.includes('write_approval')) {
        configContent += content;
      }
    } catch { /* cannot read global config */ }
  }

  // Parse YAML-like key-value pairs for security checks
  if (configContent) {
    // Check skills.write_approval
    const writeApproval = extractYamlValue(configContent, 'write_approval');
    if (writeApproval !== null && writeApproval !== 'true') {
      findings.push({
        type: 'SECURITY',
        severity: 'AMBER_REVIEW',
        message: 'skills.write_approval is not set to true. Skill writes may proceed without approval.'
      });
    } else if (writeApproval === 'true') {
      findings.push({
        type: 'INFO',
        severe: false,
        message: 'skills.write_approval: true — skill writes are gated behind approval.'
      });
    }

    // Check memory.write_approval
    const memWriteApproval = extractYamlValue(configContent, 'memory', 'write_approval');
    if (memWriteApproval !== null && memWriteApproval !== 'true') {
      findings.push({
        type: 'SECURITY',
        severity: 'AMBER_REVIEW',
        message: 'memory.write_approval is not set to true. Memory writes may proceed without approval.'
      });
    }

    // Check for /yolo bypass susceptibility (multi-line YAML safe)
    if (/approvals:\s*\n\s*mode:\s*off/.test(configContent)) {
      findings.push({
        type: 'CRITICAL',
        severity: 'RED_BLOCK',
        message: 'approvals.mode is "off" — equivalent to permanent /yolo. This must be changed to "smart" or "manual".'
      });
    }

    // Check MCP sampling
    if (configContent.includes('sampling') && configContent.includes('enabled: true')) {
      findings.push({
        type: 'WARNING',
        severity: 'AMBER_REVIEW',
        message: 'MCP sampling is enabled. Consider disabling for untrusted MCP servers.'
      });
    }

    // Check MCP toolfilter
    if (configContent.includes('toolfilter') && configContent.includes('default: allow')) {
      findings.push({
        type: 'WARNING',
        severity: 'AMBER_REVIEW',
        message: 'MCP toolfilter default is "allow". Consider "deny" for defense-in-depth.'
      });
    }

    // Check external skill dirs (not a write boundary)
    if (configContent.includes('external_dirs')) {
      warnings.push('External skill directories configured. These are NOT a write-protection boundary. Use filesystem permissions for read-only.');
    }
  }

  // Check for /yolo environment variable
  if (process.env.HERMES_YOLO_MODE === '1') {
    findings.push({
      type: 'CRITICAL',
      severity: 'RED_BLOCK',
      message: 'HERMES_YOLO_MODE=1 is set — all approval prompts bypassed. This must be disabled.'
    });
  }

  const classification = findings.some(f => f.severity === 'RED_BLOCK')
    ? CLASSIFICATIONS.RED_BLOCK
    : findings.some(f => f.severity === 'AMBER_REVIEW')
      ? CLASSIFICATIONS.AMBER_REVIEW
      : CLASSIFICATIONS.GREEN_SAFE;

  return {
    runtime: ADAPTER_ID,
    classification,
    verificationLevel: configContent ? VERIFICATION_LEVELS.STRUCTURAL_PASS : VERIFICATION_LEVELS.NOT_CHECKED,
    findings,
    warnings,
    toolGaps: []
  };
}

// ── Runtime Gates ─────────────────────────────────────────────────

export function evaluateRuntimeGates(context = {}) {
  const validation = validate(context);
  const blockedBy = [];

  for (const finding of validation.findings) {
    if (finding.severity === 'RED_BLOCK' || finding.severity === 'AMBER_REVIEW') {
      blockedBy.push({
        layer: 'hermes_adapter',
        type: finding.type,
        message: finding.message
      });
    }
  }

  return {
    runtime: ADAPTER_ID,
    classification: validation.classification,
    verificationLevel: validation.verificationLevel,
    blockedBy,
    warnings: validation.warnings
  };
}

// ── Handoff ───────────────────────────────────────────────────────

export function generateHandoff(context = {}) {
  // Hermes supports native bundles — no handoff needed
  return {
    runtime: ADAPTER_ID,
    canGenerate: false,
    reason: 'Hermes natively supports skill bundles and the canonical working method. No handoff needed.'
  };
}

// ── Runtime Smoke ─────────────────────────────────────────────────

export async function runtimeSmoke(context = {}) {
  try {
    const { execSync } = await import('node:child_process');
    const version = execSync('hermes --version 2>&1', { timeout: 10000, encoding: 'utf-8' }).trim();
    return {
      runtime: ADAPTER_ID,
      passed: true,
      version,
      verificationLevel: VERIFICATION_LEVELS.RUNTIME_SMOKE_PASS,
      toolGaps: []
    };
  } catch (e) {
    return {
      runtime: ADAPTER_ID,
      passed: false,
      failures: [`Hermes CLI not available: ${e.message}`],
      toolGaps: ['HERMES_CLI_NOT_FOUND', 'TOOL_GAP_HERMES_RUNTIME'],
      verificationLevel: VERIFICATION_LEVELS.TOOL_GAP
    };
  }
}

// ── Evidence ───────────────────────────────────────────────────────

export function normalizeEvidence(context = {}) {
  const targetRoot = context.targetRoot || process.cwd();
  const verified = [];
  const unverified = [];

  if (existsSync(resolve(targetRoot, '.hermes.md'))) {
    verified.push('hermes_project_config');
  }

  if (existsSync(resolve(targetRoot, '.hermes', 'skill-bundles'))) {
    verified.push('hermes_skill_bundles');
  }

  if (existsSync(resolve(HERMES_HOME, 'config.yaml'))) {
    verified.push('hermes_global_config_exists');
  } else {
    unverified.push('hermes_global_config');
  }

  return {
    runtime: ADAPTER_ID,
    verified,
    unverified
  };
}

// ── Helpers ────────────────────────────────────────────────────────

function extractYamlValue(content, parentKey, childKey) {
  const lines = content.split('\n');
  let inSection = false;

  for (const line of lines) {
    if (line.trim().startsWith(`${parentKey}:`)) {
      inSection = true;
      continue;
    }
    if (inSection && line.trim().startsWith(`${childKey || 'write_approval'}:`)) {
      const val = line.split(':')[1].trim();
      return val;
    }
    if (inSection && !line.startsWith('  ') && line.trim() !== '') {
      inSection = false;
    }
  }

  return null;
}

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
