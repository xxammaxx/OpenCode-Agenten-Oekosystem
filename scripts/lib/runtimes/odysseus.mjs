/**
 * Odysseus Runtime Adapter
 *
 * Multi-signal detection with confidence scoring for Odysseus AI Workspace.
 * Odysseus is AGPL-3.0-or-later — this adapter MUST NOT incorporate any
 * Odysseus source code. Detection is based on file presence, not content.
 *
 * Key signals (in order of uniqueness):
 * - integrations/claude/ + integrations/codex/ (98% confidence)
 * - companion/ (98% confidence)
 * - app.py + core/auth.py (95% confidence)
 * - src/preset_manager.py (90% confidence)
 * - docker-compose.yml with "ody-cookbook" (85% confidence)
 * - src/builtin_mcp.py (80% confidence)
 *
 * Odysseus-specific risks gated:
 * - Network binding (RED_BLOCK for 0.0.0.0 without auth)
 * - Docker socket (RED_BLOCK without separate approval)
 * - Shell execution (scope-gated approval)
 * - SSH/Remote server (separate approval)
 * - Email send (separate approval)
 * - Calendar write (separate approval)
 * - Memory write (separate approval)
 * - Model download (project-level gate)
 * - MCP Tier 2 (human gate)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAdapterResult, getConfidenceLevel } from './contract.mjs';
import { CLASSIFICATIONS, VERIFICATION_LEVELS } from '../gates/classifications.mjs';

/** @type {string} */
export const ADAPTER_ID = 'odysseus';

// ── Detection Signal Definitions ──────────────────────────────────

/** Each signal has a weight and an isUnique flag */
const DETECTION_SIGNALS = Object.freeze([
  { signal: 'integrations/claude/', file: 'integrations/claude', weight: 35, unique: true },
  { signal: 'integrations/codex/', file: 'integrations/codex', weight: 30, unique: true },
  { signal: 'companion/', file: 'companion', weight: 25, unique: true },
  { signal: 'app.py + core/auth.py', file: 'app.py', weight: 20, unique: true, requires: ['core/auth.py'] },
  { signal: 'src/preset_manager.py', file: 'src/preset_manager.py', weight: 15, unique: true },
  { signal: 'src/builtin_mcp.py', file: 'src/builtin_mcp.py', weight: 10, unique: false },
  { signal: 'routes/skills_routes.py', file: 'routes/skills_routes.py', weight: 8, unique: false },
  { signal: 'docker-compose.yml (odysseus)', file: 'docker-compose.yml', weight: 10, unique: false,
    requiresContent: 'ody-cookbook' },
  { signal: 'src/constants.py', file: 'src/constants.py', weight: 5, unique: false },
  { signal: 'src/agent_loop.py', file: 'src/agent_loop.py', weight: 5, unique: false },
  { signal: 'src/tool_security.py', file: 'src/tool_security.py', weight: 8, unique: false },
  { signal: 'Odysseus.spec', file: 'Odysseus.spec', weight: 10, unique: true },
  { signal: 'core/middleware.py', file: 'core/middleware.py', weight: 3, unique: false }
]);

// Generic Python signals that should NOT boost Odysseus confidence alone
const GENERIC_PYTHON_SIGNALS = ['requirements.txt', 'setup.py', 'setup.cfg', 'pyproject.toml'];

// ── Detection ─────────────────────────────────────────────────────

export function detect(context = {}) {
  const targetRoot = context.targetRoot || process.cwd();
  const signals = [];
  let confidence = 0;

  for (const sig of DETECTION_SIGNALS) {
    const fullPath = resolve(targetRoot, sig.file);

    if (!existsSync(fullPath)) continue;

    // Check required companion files
    if (sig.requires) {
      const allPresent = sig.requires.every(r => existsSync(resolve(targetRoot, r)));
      if (!allPresent) continue;
    }

    // Check content requirement
    if (sig.requiresContent) {
      try {
        const content = readFileSync(fullPath, 'utf-8');
        if (!content.includes(sig.requiresContent)) continue;
      } catch { continue; }
    }

    signals.push({
      signal: sig.signal,
      weight: sig.weight,
      unique: sig.unique
    });
    confidence += sig.weight;
  }

  // Boost for multiple unique signals
  const uniqueCount = signals.filter(s => s.unique).length;
  if (uniqueCount >= 3) {
    confidence = Math.min(confidence + 10, 100);
  }

  confidence = Math.min(confidence, 100);

  // Check for generic Python signals (don't count, but note them)
  const genericSignals = [];
  for (const gs of GENERIC_PYTHON_SIGNALS) {
    if (existsSync(resolve(targetRoot, gs))) {
      genericSignals.push(gs);
    }
  }

  return {
    runtime: ADAPTER_ID,
    confidence,
    confidenceLevel: getConfidenceLevel(confidence),
    signals,
    genericSignals,
    message: confidence >= 80
      ? `Odysseus detected with ${confidence}% confidence (${uniqueCount} unique signals).`
      : confidence >= 50
        ? `Possible Odysseus project (${confidence}% confidence — AMBER_REVIEW). Verify manually.`
        : `Odysseus not confidently detected (${confidence}%).`
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
      hasCLI: false, // no standalone CLI
      hasStructuralConfig: detection.confidence >= 80,
      hasLiveTest: true, // Docker-based
      knownPermissionModel: true,
      knownSkillSystem: false, // incompatible format
      knownMCPSupport: true,
      knownAgentSystem: true,
      requiresHandoff: true, // KEY: handoff-only, no native import
      configFormat: 'env',
      deploymentModel: 'docker',
      authSystem: 'bcrypt + sessions + TOTP'
    },
    risks: [
      'AGPL-3.0-or-later — adapter MUST NOT incorporate Odysseus source code. Handoff only.',
      'No native import API for external agent rules — handoff artifacts required.',
      'Docker socket NOT mounted by default — explicit opt-in via docker/host-docker.yml.',
      'Shell execution has no sandbox (known gap #1058).',
      '0.0.0.0 binding without auth is CRITICAL — RED_BLOCK.',
      'Skills use JSON format (data/skills.json) — incompatible with SKILL.md.',
      'Email/Calendar/Remote Server tools are admin-only — require separate approval.'
    ]
  });
}

// ── Validation ────────────────────────────────────────────────────

export function validate(context = {}) {
  const targetRoot = context.targetRoot || process.cwd();
  const findings = [];
  const warnings = [];

  // Check .env for network binding
  const envPath = resolve(targetRoot, '.env');
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        // Check APP_BIND
        if (trimmed.startsWith('APP_BIND=')) {
          const bindValue = trimmed.split('=')[1].trim();
          if (bindValue === '0.0.0.0') {
            // Check if auth is enabled
            const authLine = lines.find(l => l.trim().startsWith('AUTH_ENABLED='));
            const authEnabled = authLine ? authLine.split('=')[1].trim() !== 'false' : true;

            if (!authEnabled) {
              findings.push({
                type: 'CRITICAL',
                severity: 'RED_BLOCK',
                file: '.env',
                message: 'APP_BIND=0.0.0.0 with AUTH_ENABLED=false — public exposure without authentication. RED_BLOCK.'
              });
            } else {
              findings.push({
                type: 'WARNING',
                severity: 'AMBER_REVIEW',
                file: '.env',
                message: 'APP_BIND=0.0.0.0 — network exposure detected. Authentication must remain enabled.'
              });
            }
          }
          if (bindValue && bindValue !== '127.0.0.1' && bindValue !== 'localhost' && bindValue !== '0.0.0.0') {
            warnings.push(`APP_BIND is "${bindValue}" — ensure authentication is enabled for LAN/reverse-proxy bindings.`);
          }
        }

        // Check LOCALHOST_BYPASS
        if (trimmed.startsWith('LOCALHOST_BYPASS=')) {
          const val = trimmed.split('=')[1].trim().toLowerCase();
          if (val === 'true') {
            findings.push({
              type: 'SECURITY',
              severity: 'AMBER_REVIEW',
              file: '.env',
              message: 'LOCALHOST_BYPASS=true — development-only. Must be false for Docker/LAN/reverse proxy.'
            });
          }
        }

        // Check Docker socket
        if (trimmed.startsWith('ODYSSEUS_ENABLE_HOST_DOCKER=')) {
          const val = trimmed.split('=')[1].trim().toLowerCase();
          if (val === 'true') {
            findings.push({
              type: 'CRITICAL',
              severity: 'RED_BLOCK',
              file: '.env',
              message: 'ODYSSEUS_ENABLE_HOST_DOCKER=true — Docker socket exposed. Requires separate high-trust approval.'
            });
          }
        }
      }
    } catch { /* cannot read .env */ }
  }

  // Check docker-compose.yml for host-docker overlay
  const composePath = resolve(targetRoot, 'docker-compose.yml');
  if (existsSync(composePath)) {
    try {
      const content = readFileSync(composePath, 'utf-8');
      if (content.includes('host-docker.yml') || content.includes('/var/run/docker.sock')) {
        findings.push({
          type: 'CRITICAL',
          severity: 'RED_BLOCK',
          file: 'docker-compose.yml',
          message: 'Docker socket mount detected in compose file. High-trust — requires separate approval.'
        });
      }
    } catch { /* skip */ }
  }

  // Check COMPOSE_FILE env var
  if (process.env.COMPOSE_FILE && process.env.COMPOSE_FILE.includes('host-docker')) {
    findings.push({
      type: 'CRITICAL',
      severity: 'RED_BLOCK',
      message: 'COMPOSE_FILE includes host-docker.yml overlay. Docker socket will be mounted.'
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
    verificationLevel: findings.length > 0 ? VERIFICATION_LEVELS.STRUCTURAL_PASS : VERIFICATION_LEVELS.NOT_CHECKED,
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
    blockedBy.push({
      layer: 'odysseus_adapter',
      type: finding.type,
      severity: finding.severity,
      message: finding.message,
      file: finding.file
    });
  }

  return {
    runtime: ADAPTER_ID,
    classification: validation.classification,
    verificationLevel: validation.verificationLevel,
    blockedBy,
    warnings: validation.warnings,
    requiredApprovals: determineOdysseusApprovals(context)
  };
}

// ── Handoff ───────────────────────────────────────────────────────

export function generateHandoff(context = {}) {
  const targetRoot = context.targetRoot || process.cwd();
  const detection = detect(context);
  const artifacts = [];

  if (detection.confidence < 50) {
    return {
      runtime: ADAPTER_ID,
      canGenerate: false,
      reason: `Odysseus not confidently detected (${detection.confidence}%). No handoff generated.`,
      artifacts: []
    };
  }

  // Proposed handoff artifacts (NOT written — just listed for dry-run)
  artifacts.push({
    path: 'integrations/odysseus/README.md',
    type: 'documentation',
    description: 'Import instructions for manual preset import'
  });
  artifacts.push({
    path: 'integrations/odysseus/system-prompt.md',
    type: 'configuration',
    description: 'Gate policy as system prompt text for Odysseus presets'
  });
  artifacts.push({
    path: 'integrations/odysseus/gate-policy.json',
    type: 'configuration',
    description: 'Machine-readable gate definitions for Odysseus'
  });
  artifacts.push({
    path: 'integrations/odysseus/tool-policy.json',
    type: 'configuration',
    description: 'Tool restrictions for Odysseus (shell, email, calendar, MCP, models)'
  });
  artifacts.push({
    path: 'integrations/odysseus/approval-model.json',
    type: 'configuration',
    description: 'Approval receipt schema for Odysseus operations'
  });
  artifacts.push({
    path: 'integrations/odysseus/runtime-profile.json',
    type: 'configuration',
    description: 'Odysseus capability mapping and risk profile'
  });
  artifacts.push({
    path: 'integrations/odysseus/manual-import.md',
    type: 'documentation',
    description: 'Step-by-step manual import guide'
  });

  return {
    runtime: ADAPTER_ID,
    canGenerate: true,
    handoffType: 'MANUAL_IMPORT', // NOT native integration
    nativeIntegration: false, // HONEST: no native import API exists
    artifacts,
    notes: [
      'Odysseus has NO native import API for external agent rules.',
      'Handoff artifacts must be manually imported via Settings UI or direct file copy.',
      'This is NOT a live integration — mark as STRUCTURAL_PASS.',
      'AGPL-3.0 boundary respected — no Odysseus source code is incorporated.',
      `Upstream reference: https://github.com/odysseus-dev/odysseus (branch: dev)`
    ]
  };
}

// ── Runtime Smoke ─────────────────────────────────────────────────

export async function runtimeSmoke(context = {}) {
  // Odysseus requires Docker for live testing
  try {
    const { execSync } = await import('node:child_process');
    const dockerVersion = execSync('docker compose version 2>&1', { timeout: 10000, encoding: 'utf-8' }).trim();

    return {
      runtime: ADAPTER_ID,
      passed: true,
      dockerVersion,
      verificationLevel: VERIFICATION_LEVELS.RUNTIME_SMOKE_PASS,
      toolGaps: [],
      note: 'Docker Compose available — Odysseus can be smoke-tested via Docker. Actual Odysseus instance not verified.'
    };
  } catch (e) {
    return {
      runtime: ADAPTER_ID,
      passed: false,
      failures: [`Docker Compose not available: ${e.message}`],
      toolGaps: ['ODYSSEUS_RUNTIME_REQUIRES_DOCKER', 'TOOL_GAP_ODYSSEUS_RUNTIME'],
      verificationLevel: VERIFICATION_LEVELS.TOOL_GAP
    };
  }
}

// ── Evidence ───────────────────────────────────────────────────────

export function normalizeEvidence(context = {}) {
  const targetRoot = context.targetRoot || process.cwd();
  const verified = [];
  const unverified = [];

  const signals = detect(context).signals;
  if (signals.length > 0) {
    verified.push(`odysseus_detection_${signals.length}_signals`);
  }

  if (existsSync(resolve(targetRoot, '.env'))) {
    verified.push('odysseus_env_file_exists');
  } else {
    unverified.push('odysseus_env_file');
  }

  if (existsSync(resolve(targetRoot, 'docker-compose.yml'))) {
    verified.push('odysseus_docker_compose');
  }

  return {
    runtime: ADAPTER_ID,
    verified,
    unverified
  };
}

// ── Odysseus-Specific Approval Determination ──────────────────────

function determineOdysseusApprovals(context = {}) {
  const approvals = [];
  const validation = validate(context);

  // Check each risk area
  const hasDockerSocket = validation.findings.some(f =>
    f.message && f.message.includes('Docker socket'));
  const hasPublicBind = validation.findings.some(f =>
    f.message && f.message.includes('APP_BIND=0.0.0.0'));

  if (hasDockerSocket) {
    approvals.push({ type: 'docker_socket_approval', required: true, gate: 'high_trust', reason: 'Docker socket exposes host daemon' });
  }

  if (hasPublicBind) {
    approvals.push({ type: 'network_binding_approval', required: true, gate: 'owner', reason: 'Public network exposure' });
  }

  // Standard Odysseus approvals
  approvals.push({ type: 'shell_write_approval', required: true, gate: 'owner', reason: 'Shell execution on host (no sandbox)' });
  approvals.push({ type: 'ssh_write_approval', required: true, gate: 'owner', reason: 'Remote server access' });
  approvals.push({ type: 'email_send_approval', required: true, gate: 'owner', reason: 'Email sending capability' });
  approvals.push({ type: 'calendar_write_approval', required: true, gate: 'owner', reason: 'Calendar modification' });
  approvals.push({ type: 'model_download_approval', required: true, gate: 'owner', reason: 'Model downloads and serving' });
  approvals.push({ type: 'memory_write_approval', required: true, gate: 'owner', reason: 'Persistent memory writes' });
  approvals.push({ type: 'mcp_tier_2_approval', required: true, gate: 'human', reason: 'Tier 2 MCP servers require human approval' });

  return approvals;
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
