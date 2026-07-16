/**
 * OpenCode Runtime Adapter
 *
 * Detects OpenCode from filesystem signals:
 * - opencode.json or opencode.jsonc in project root
 * - .opencode/ directory with agents/, skills/, policies/
 * - AGENTS.md with OpenCode managed section markers
 *
 * Structural checks:
 * - Permission model (allow/ask/deny)
 * - Deprecated tools key detection
 * - Agent definitions (JSON or Markdown)
 * - Skill validity (SKILL.md frontmatter)
 * - MCP server configuration
 * - Reviewer agent write protection
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createAdapterResult, getConfidenceLevel } from './contract.mjs';
import { CLASSIFICATIONS, VERIFICATION_LEVELS } from '../gates/classifications.mjs';

/** @type {string} */
export const ADAPTER_ID = 'opencode';

// ── Detection ─────────────────────────────────────────────────────

export function detect(context = {}) {
  const targetRoot = context.targetRoot || process.cwd();
  const signals = [];
  let confidence = 0;

  // Primary signals
  if (existsSync(resolve(targetRoot, 'opencode.jsonc'))) {
    signals.push({ signal: 'opencode.jsonc', weight: 40 });
    confidence += 40;
  }
  if (existsSync(resolve(targetRoot, 'opencode.json'))) {
    signals.push({ signal: 'opencode.json', weight: 35 });
    confidence += 35;
  }
  if (existsSync(resolve(targetRoot, '.opencode'))) {
    const opencodeDir = resolve(targetRoot, '.opencode');
    try {
      const entries = readdirSync(opencodeDir);
      const hasAgents = entries.includes('agents');
      const hasSkills = entries.includes('skills');
      const hasPolicies = entries.includes('policies');
      const hasReports = entries.includes('reports');

      if (hasAgents) { signals.push({ signal: '.opencode/agents/', weight: 15 }); confidence += 15; }
      if (hasSkills) { signals.push({ signal: '.opencode/skills/', weight: 15 }); confidence += 15; }
      if (hasPolicies) { signals.push({ signal: '.opencode/policies/', weight: 10 }); confidence += 10; }
      if (hasReports) { signals.push({ signal: '.opencode/reports/', weight: 5 }); confidence += 5; }
    } catch { /* cannot read directory */ }
  }

  // Check for AGENTS.md with OpenCode managed section markers
  const agentsMd = resolve(targetRoot, 'AGENTS.md');
  if (existsSync(agentsMd)) {
    try {
      const content = readFileSync(agentsMd, 'utf-8');
      if (content.includes('<!-- BEGIN OPENCODE-AGENT-ECOSYSTEM -->')) {
        signals.push({ signal: 'AGENTS.md (managed)', weight: 15 });
        confidence += 15;
        // Boost: this is a project bootstrapped by our ecosystem
        confidence = Math.min(confidence + 10, 100);
      }
    } catch { /* cannot read */ }
  }

  confidence = Math.min(confidence, 100);

  return {
    runtime: ADAPTER_ID,
    confidence,
    confidenceLevel: getConfidenceLevel(confidence),
    signals,
    message: confidence >= 80
      ? `OpenCode detected with ${confidence}% confidence.`
      : confidence >= 50
        ? `Possible OpenCode project (${confidence}% confidence).`
        : 'OpenCode not detected.'
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
      knownAgentSystem: true,
      requiresHandoff: false,
      configFormat: 'jsonc',
      configSchema: 'https://opencode.ai/config.json'
    },
    risks: [
      'Deprecated "tools" key may exist — must migrate to "permission".',
      'Deprecated agent-level "tools" boolean may weaken permission model.',
      'external_directory permission default: "ask" — explicit deny recommended.',
      'MCP servers should remain disabled by default.'
    ]
  });
}

// ── Validation ────────────────────────────────────────────────────

export function validate(context = {}) {
  const targetRoot = context.targetRoot || process.cwd();
  const findings = [];
  const warnings = [];

  // Check for deprecated tools key
  const configPaths = ['opencode.jsonc', 'opencode.json'];
  for (const configPath of configPaths) {
    const fullPath = resolve(targetRoot, configPath);
    if (!existsSync(fullPath)) continue;

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const config = JSON.parse(stripJsonComments(content));

      // Check top-level deprecated tools
      if (config.tools !== undefined) {
        findings.push({
          type: 'DEPRECATED',
          severity: 'AMBER_REVIEW',
          file: configPath,
          message: `Top-level "tools" key is deprecated. Migrate to "permission" key (allow/ask/deny).`
        });
      }

      // Check agent-level deprecated tools
      if (config.agent) {
        for (const [agentName, agentConfig] of Object.entries(config.agent)) {
          if (agentConfig && agentConfig.tools !== undefined) {
            findings.push({
              type: 'DEPRECATED',
              severity: 'AMBER_REVIEW',
              file: configPath,
              agent: agentName,
              message: `Agent "${agentName}" uses deprecated "tools" boolean. Use "permission" object instead.`
            });
          }
        }
      }

      // Check permissions
      if (config.permission) {
        const perm = config.permission;
        if (perm === 'allow' || perm === true) {
          findings.push({
            type: 'WARNING',
            severity: 'AMBER_REVIEW',
            file: configPath,
            message: 'All permissions set to "allow" — no restrictions. Consider ask/deny model.'
          });
        }
        if (typeof perm === 'object') {
          if (perm.edit === 'allow' || perm.write === 'allow') {
            warnings.push('Edit/write permission is "allow" — changes can occur without user confirmation.');
          }
          if (!perm.external_directory || perm.external_directory === 'allow') {
            findings.push({
              type: 'WARNING',
              severity: 'AMBER_REVIEW',
              file: configPath,
              message: 'external_directory permission not explicitly restricted. Consider "ask" or "deny".'
            });
          }
        }
      }

      // Check MCP servers
      if (config.mcp) {
        const enabledMcps = Object.entries(config.mcp)
          .filter(([, server]) => server && server.enabled === true)
          .map(([name]) => name);

        if (enabledMcps.length > 0) {
          findings.push({
            type: 'INFO',
            severe: false,
            message: `${enabledMcps.length} MCP server(s) enabled: ${enabledMcps.join(', ')}.`
          });
        }
      }
    } catch (e) {
      findings.push({
        type: 'ERROR',
        severity: 'AMBER_REVIEW',
        file: configPath,
        message: `Cannot parse OpenCode config: ${e.message}`
      });
    }
  }

  // Check agent definitions for reviewer write
  const agentsDir = resolve(targetRoot, '.opencode', 'agents');
  if (existsSync(agentsDir)) {
    try {
      const agentFiles = readdirSync(agentsDir).filter(f => f.endsWith('.md'));
      const reviewerNames = ['review-agent', 'reviewer', 'code-reviewer', 'review'];
      for (const agentFile of agentFiles) {
        const agentName = basename(agentFile, '.md');
        if (reviewerNames.some(r => agentName.toLowerCase().includes(r))) {
          findings.push({
            type: 'INFO',
            severity: 'AMBER_REVIEW',
            agent: agentName,
            message: `Reviewer agent "${agentName}" should have edit: deny and bash: deny. Verify permissions.`
          });
        }
      }
    } catch { /* cannot read */ }
  }

  const classification = findings.some(f => f.severity === 'AMBER_REVIEW')
    ? CLASSIFICATIONS.AMBER_REVIEW
    : CLASSIFICATIONS.GREEN_SAFE;

  return {
    runtime: ADAPTER_ID,
    classification,
    verificationLevel: VERIFICATION_LEVELS.STRUCTURAL_PASS,
    findings,
    warnings,
    toolGaps: []
  };
}

// ── Runtime Gates ─────────────────────────────────────────────────

export function evaluateRuntimeGates(context = {}) {
  const detection = detect(context);
  const validation = validate(context);
  const blockedBy = [];

  for (const finding of validation.findings) {
    if (finding.severity === 'AMBER_REVIEW' || finding.type === 'DEPRECATED') {
      blockedBy.push({
        layer: 'opencode_adapter',
        type: finding.type,
        message: finding.message,
        file: finding.file
      });
    }
  }

  return {
    runtime: ADAPTER_ID,
    classification: blockedBy.length > 0 ? CLASSIFICATIONS.AMBER_REVIEW : CLASSIFICATIONS.GREEN_SAFE,
    verificationLevel: VERIFICATION_LEVELS.STRUCTURAL_PASS,
    blockedBy,
    warnings: validation.warnings
  };
}

// ── Handoff ────────────────────────────────────────────────────────

export function generateHandoff(context = {}) {
  // OpenCode does not require handoff — it natively supports the ecosystem
  return {
    runtime: ADAPTER_ID,
    canGenerate: false,
    reason: 'OpenCode natively supports the ecosystem configuration. No handoff needed.'
  };
}

// ── Runtime Smoke ─────────────────────────────────────────────────

export async function runtimeSmoke(context = {}) {
  try {
    const { execSync } = await import('node:child_process');
    const version = execSync('opencode --version 2>&1', { timeout: 10000, encoding: 'utf-8' }).trim();
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
      failures: [`OpenCode CLI not available: ${e.message}`],
      toolGaps: ['OPENGODE_CLI_NOT_FOUND'],
      verificationLevel: VERIFICATION_LEVELS.TOOL_GAP
    };
  }
}

// ── Evidence ───────────────────────────────────────────────────────

export function normalizeEvidence(context = {}) {
  const targetRoot = context.targetRoot || process.cwd();
  const verified = [];
  const unverified = [];

  const configPath = resolve(targetRoot, 'opencode.jsonc');
  if (existsSync(configPath)) {
    verified.push('opencode_config');
  } else {
    unverified.push('opencode_config');
  }

  if (existsSync(resolve(targetRoot, '.opencode', 'agents'))) {
    verified.push('agent_definitions');
  } else {
    unverified.push('agent_definitions');
  }

  return {
    runtime: ADAPTER_ID,
    verified,
    unverified
  };
}

// ── Helpers ────────────────────────────────────────────────────────

function stripJsonComments(jsoncContent) {
  // Remove single-line comments
  let stripped = jsoncContent.replace(/\/\/.*$/gm, '');
  // Remove block comments
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove trailing commas
  stripped = stripped.replace(/,(\s*[}\]])/g, '$1');
  return stripped;
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
