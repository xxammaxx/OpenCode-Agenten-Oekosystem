/**
 * Runtime Adapter Tests
 *
 * Validates:
 * - OpenCode detection and validation
 * - Hermes detection and validation
 * - Odysseus multi-signal detection and handoff
 * - Generic fallback
 * - Adapter contract compliance
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import * as genericAdapter from '../../scripts/lib/runtimes/generic.mjs';
import * as opencodeAdapter from '../../scripts/lib/runtimes/opencode.mjs';
import * as hermesAdapter from '../../scripts/lib/runtimes/hermes.mjs';
import * as odysseusAdapter from '../../scripts/lib/runtimes/odysseus.mjs';
import { normalizeRuntime, getConfidenceLevel, validateAdapterAgainstKernel, CONFIDENCE_THRESHOLDS } from '../../scripts/lib/runtimes/contract.mjs';
import { CLASSIFICATIONS, VERIFICATION_LEVELS } from '../../scripts/lib/gates/classifications.mjs';

// ── Helpers ──────────────────────────────────────────────────

function createTempDir() {
  const dir = resolve(tmpdir(), `gate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTempDir(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ── Contract Tests ───────────────────────────────────────────

describe('Runtime Adapter Contract', () => {

  it('normalizeRuntime returns generic for unknown', () => {
    assert.strictEqual(normalizeRuntime('unknown_runtime'), 'generic');
    assert.strictEqual(normalizeRuntime(null), 'generic');
    assert.strictEqual(normalizeRuntime(''), 'generic');
  });

  it('normalizeRuntime returns correct for known', () => {
    assert.strictEqual(normalizeRuntime('OPENCODE'), 'opencode');
    assert.strictEqual(normalizeRuntime('Hermes'), 'hermes');
    assert.strictEqual(normalizeRuntime('ODYSSEUS'), 'odysseus');
    assert.strictEqual(normalizeRuntime('generic'), 'generic');
  });

  it('getConfidenceLevel classifies correctly', () => {
    assert.strictEqual(getConfidenceLevel(0), 'NOT_DETECTED');
    assert.strictEqual(getConfidenceLevel(49), 'NOT_DETECTED');
    assert.strictEqual(getConfidenceLevel(50), 'AMBER_REVIEW');
    assert.strictEqual(getConfidenceLevel(79), 'AMBER_REVIEW');
    assert.strictEqual(getConfidenceLevel(80), 'DETECTED');
    assert.strictEqual(getConfidenceLevel(100), 'DETECTED');
  });

  it('validateAdapterAgainstKernel catches false live claims', () => {
    const result = validateAdapterAgainstKernel({
      verificationLevel: VERIFICATION_LEVELS.LIVE_INTEGRATION_PASS,
      liveVerificationPerformed: false
    }, []);
    assert.strictEqual(result.clean, false);
    assert.ok(result.violations.some(v => v.code === 'ADAPTER_FALSE_LIVE_CLAIM'));
  });

  it('validateAdapterAgainstKernel catches masked kernel block', () => {
    const result = validateAdapterAgainstKernel({
      classification: CLASSIFICATIONS.GREEN_SAFE,
      kernelBlocked: true
    }, []);
    assert.strictEqual(result.clean, false);
  });

  it('validateAdapterAgainstKernel passes clean result', () => {
    const result = validateAdapterAgainstKernel({
      classification: CLASSIFICATIONS.GREEN_SAFE,
      verificationLevel: VERIFICATION_LEVELS.STRUCTURAL_PASS,
      liveVerificationPerformed: false
    }, []);
    assert.strictEqual(result.clean, true);
  });
});

// ── OpenCode Adapter Tests ───────────────────────────────────

describe('OpenCode Adapter', () => {

  it('detects OpenCode from opencode.jsonc', () => {
    const dir = createTempDir();
    try {
      writeFileSync(resolve(dir, 'opencode.jsonc'), '{}');
      const result = opencodeAdapter.detect({ targetRoot: dir });
      assert.ok(result.confidence >= 35, `Confidence ${result.confidence} should be >= 35`);
      assert.strictEqual(result.runtime, 'opencode');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('detects OpenCode from .opencode/ directory', () => {
    const dir = createTempDir();
    try {
      mkdirSync(resolve(dir, '.opencode', 'agents'), { recursive: true });
      mkdirSync(resolve(dir, '.opencode', 'skills'), { recursive: true });
      const result = opencodeAdapter.detect({ targetRoot: dir });
      assert.ok(result.confidence >= 30, `Confidence ${result.confidence} should be >= 30`);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('validates deprecated tools key', () => {
    const dir = createTempDir();
    try {
      writeFileSync(resolve(dir, 'opencode.jsonc'), JSON.stringify({
        tools: true
      }));
      const result = opencodeAdapter.validate({ targetRoot: dir });
      const deprecationFinding = result.findings.find(f => f.type === 'DEPRECATED' && f.message.includes('tools'));
      assert.ok(deprecationFinding, 'Should find deprecated tools key');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('reports capabilities correctly', () => {
    const dir = createTempDir();
    try {
      writeFileSync(resolve(dir, 'opencode.jsonc'), '{}');
      const result = opencodeAdapter.capabilities({ targetRoot: dir });
      assert.strictEqual(result.capabilities.hasCLI, true);
      assert.strictEqual(result.capabilities.knownPermissionModel, true);
      assert.strictEqual(result.capabilities.configFormat, 'jsonc');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('does not detect OpenCode in empty directory', () => {
    const dir = createTempDir();
    try {
      const result = opencodeAdapter.detect({ targetRoot: dir });
      assert.ok(result.confidence < 50, `Empty dir should not have high OpenCode confidence, got ${result.confidence}`);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── Hermes Adapter Tests ─────────────────────────────────────

describe('Hermes Adapter', () => {

  it('detects Hermes from .hermes.md', () => {
    const dir = createTempDir();
    try {
      writeFileSync(resolve(dir, '.hermes.md'), '# Hermes Config');
      const result = hermesAdapter.detect({ targetRoot: dir });
      assert.ok(result.confidence >= 35, `Confidence ${result.confidence} should be >= 35`);
      assert.strictEqual(result.runtime, 'hermes');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('detects Hermes from .hermes/skill-bundles/', () => {
    const dir = createTempDir();
    try {
      mkdirSync(resolve(dir, '.hermes', 'skill-bundles'), { recursive: true });
      const result = hermesAdapter.detect({ targetRoot: dir });
      assert.ok(result.confidence >= 20, `Confidence ${result.confidence} should be >= 20`);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('flags YOLO mode as RED_BLOCK', () => {
    const dir = createTempDir();
    try {
      mkdirSync(resolve(dir, '.hermes'), { recursive: true });
      writeFileSync(resolve(dir, '.hermes', 'config.example.yaml'), 'skills:\n  write_approval: false\nmemory:\n  write_approval: false\napprovals:\n  mode: off\nmcp:\n  sampling:\n    enabled: true');
      const result = hermesAdapter.validate({ targetRoot: dir });
      const yoloFinding = result.findings.find(f => f.severity === 'RED_BLOCK');
      assert.ok(yoloFinding, `Should flag approvals.mode: off as RED_BLOCK. Findings: ${JSON.stringify(result.findings.map(f => ({ severity: f.severity, msg: f.message })))}`);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('reports correct capabilities', () => {
    const dir = createTempDir();
    try {
      writeFileSync(resolve(dir, '.hermes.md'), '');
      const result = hermesAdapter.capabilities({ targetRoot: dir });
      assert.strictEqual(result.capabilities.supportsSkillBundles, true);
      assert.strictEqual(result.capabilities.supportsExternalSkills, true);
      assert.strictEqual(result.capabilities.configFormat, 'yaml');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('generates no handoff (native support)', () => {
    const result = hermesAdapter.generateHandoff({ targetRoot: '/tmp/test' });
    assert.strictEqual(result.canGenerate, false);
    assert.ok(result.reason.includes('natively'));
  });
});

// ── Odysseus Adapter Tests ───────────────────────────────────

describe('Odysseus Adapter', () => {

  it('detects Odysseus with multiple unique signals', () => {
    const dir = createTempDir();
    try {
      mkdirSync(resolve(dir, 'integrations', 'claude'), { recursive: true });
      mkdirSync(resolve(dir, 'integrations', 'codex'), { recursive: true });
      mkdirSync(resolve(dir, 'companion'), { recursive: true });
      mkdirSync(resolve(dir, 'core'), { recursive: true });
      writeFileSync(resolve(dir, 'app.py'), '# FastAPI');
      writeFileSync(resolve(dir, 'core', 'auth.py'), '# auth');
      const result = odysseusAdapter.detect({ targetRoot: dir });
      assert.ok(result.confidence >= 80, `Odysseus should be detected with high confidence, got ${result.confidence}`);
      assert.strictEqual(result.runtime, 'odysseus');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('does NOT produce false positives on generic Python project', () => {
    const dir = createTempDir();
    try {
      writeFileSync(resolve(dir, 'requirements.txt'), 'fastapi');
      writeFileSync(resolve(dir, 'setup.py'), '# setup');
      writeFileSync(resolve(dir, 'pyproject.toml'), '[tool]\nname = "test"');
      const result = odysseusAdapter.detect({ targetRoot: dir });
      assert.ok(result.confidence < 50, `Generic Python project should NOT be detected as Odysseus, got ${result.confidence}`);
      assert.ok(result.confidenceLevel === 'NOT_DETECTED');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('flags 0.0.0.0 binding without auth as RED_BLOCK', () => {
    const dir = createTempDir();
    try {
      writeFileSync(resolve(dir, '.env'), 'APP_BIND=0.0.0.0\nAUTH_ENABLED=false');
      const result = odysseusAdapter.validate({ targetRoot: dir });
      const criticalFinding = result.findings.find(f => f.severity === 'RED_BLOCK');
      assert.ok(criticalFinding, 'Should flag 0.0.0.0 + no auth as RED_BLOCK');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('flags Docker socket as RED_BLOCK', () => {
    const dir = createTempDir();
    try {
      writeFileSync(resolve(dir, '.env'), 'ODYSSEUS_ENABLE_HOST_DOCKER=true');
      const result = odysseusAdapter.validate({ targetRoot: dir });
      const dockerFinding = result.findings.find(f => f.severity === 'RED_BLOCK');
      assert.ok(dockerFinding, 'Should flag Docker socket as RED_BLOCK');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('generates handoff with artifacts', () => {
    const dir = createTempDir();
    try {
      mkdirSync(resolve(dir, 'integrations', 'claude'), { recursive: true });
      mkdirSync(resolve(dir, 'integrations', 'codex'), { recursive: true });
      mkdirSync(resolve(dir, 'companion'), { recursive: true });
      const result = odysseusAdapter.generateHandoff({ targetRoot: dir });
      assert.strictEqual(result.canGenerate, true);
      assert.strictEqual(result.nativeIntegration, false, 'Must not claim native integration');
      assert.ok(result.artifacts.length > 0, 'Should have handoff artifacts');
      assert.strictEqual(result.handoffType, 'MANUAL_IMPORT');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('warns about LOCALHOST_BYPASS', () => {
    const dir = createTempDir();
    try {
      writeFileSync(resolve(dir, '.env'), 'LOCALHOST_BYPASS=true');
      const result = odysseusAdapter.validate({ targetRoot: dir });
      const bypassFinding = result.findings.find(f => f.message.includes('LOCALHOST_BYPASS'));
      assert.ok(bypassFinding, 'Should warn about LOCALHOST_BYPASS');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('reports correct capabilities', () => {
    const dir = createTempDir();
    try {
      mkdirSync(resolve(dir, 'integrations', 'claude'), { recursive: true });
      const result = odysseusAdapter.capabilities({ targetRoot: dir });
      assert.strictEqual(result.capabilities.requiresHandoff, true);
      assert.strictEqual(result.capabilities.configFormat, 'env');
      assert.strictEqual(result.capabilities.deploymentModel, 'docker');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('reports required approvals for shell, email, calendar, MCP', () => {
    const result = odysseusAdapter.evaluateRuntimeGates({ targetRoot: '/tmp/odysseus-test' });
    assert.ok(result.requiredApprovals.length > 0, 'Should require multiple approvals');
    const approvalTypes = result.requiredApprovals.map(a => a.type);
    assert.ok(approvalTypes.includes('shell_write_approval'));
    assert.ok(approvalTypes.includes('email_send_approval'));
    assert.ok(approvalTypes.includes('calendar_write_approval'));
    assert.ok(approvalTypes.includes('model_download_approval'));
  });
});

// ── Generic Adapter Tests ────────────────────────────────────

describe('Generic Adapter', () => {

  it('always returns AMBER_REVIEW classification', () => {
    const result = genericAdapter.validate({ targetRoot: '/tmp/unknown' });
    assert.strictEqual(result.classification, CLASSIFICATIONS.AMBER_REVIEW);
  });

  it('cannot generate handoff', () => {
    const result = genericAdapter.generateHandoff({ targetRoot: '/tmp/unknown' });
    assert.strictEqual(result.canGenerate, false);
  });

  it('returns TOOL_GAP for runtime smoke', () => {
    const result = genericAdapter.runtimeSmoke({ targetRoot: '/tmp/unknown' });
    assert.strictEqual(result.verificationLevel, VERIFICATION_LEVELS.TOOL_GAP);
  });
});

// ── Cross-Adapter: No False Positives ────────────────────────

describe('Cross-Adapter False Positive Prevention', () => {

  it('empty directory → at most generic-type adapters give low confidence', () => {
    const dir = createTempDir();
    try {
      const oc = opencodeAdapter.detect({ targetRoot: dir });
      const od = odysseusAdapter.detect({ targetRoot: dir });
      assert.ok(oc.confidence < 50, `OpenCode should be <50 in empty dir, got ${oc.confidence}`);
      assert.ok(od.confidence < 50, `Odysseus should be <50 in empty dir, got ${od.confidence}`);
      // Hermes may be detected from global install — only check that adapter returns correctly
      const hm = hermesAdapter.detect({ targetRoot: dir });
      assert.strictEqual(hm.runtime, 'hermes');
      // Note: Hermes confidence may be high if globally installed (~/.hermes/ exists)
    } finally {
      cleanupTempDir(dir);
    }
  });
});
