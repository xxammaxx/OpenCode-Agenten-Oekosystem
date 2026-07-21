/**
 * RED tests for the planned Spec-Kit bridge.
 *
 * These tests intentionally target the not-yet-created entry point. They are
 * the pre-implementation contract and must be demonstrably red before HOT.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoRoot } from '../helpers.mjs';

const bridge = path.join(repoRoot, 'scripts', 'evaluate-operation.mjs');

describe('Spec-Kit bridge pre-implementation contract', () => {
  it('has the planned stable entry point', () => {
    assert.equal(existsSync(bridge), true, 'bridge entry point is not implemented yet');
  });

  it('will emit JSON-only stdout and the documented phase/runtime fields', () => {
    const target = repoRoot;
    const result = spawnSync(process.execPath, [
      bridge, '--project', target, '--phase', 'before-implement',
      '--runtime', 'opencode', '--json'
    ], { encoding: 'utf8' });
    // The repository itself currently contains a reviewer finding, so this
    // contract only requires a truthful structural result at repository root.
    assert.ok([0, 10].includes(result.status));
    const decision = JSON.parse(result.stdout);
    assert.equal(decision.phase, 'before-implement');
    assert.equal(decision.runtime, 'opencode');
    assert.equal(typeof decision.allowed, 'boolean');
  });

  it('will produce GREEN_SAFE for a clean structural OpenCode project', () => {
    const target = mkdtempSync(path.join(os.tmpdir(), 'spec-kit-bridge-green-'));
    try {
      writeFileSync(path.join(target, 'opencode.jsonc'), JSON.stringify({
        permission: { external_directory: 'deny' }
      }));
      const result = spawnSync(process.execPath, [
        bridge, '--project', target, '--phase', 'reality',
        '--runtime', 'opencode', '--json'
      ], { encoding: 'utf8' });
      assert.equal(result.status, 0);
      assert.equal(JSON.parse(result.stdout).classification, 'GREEN_SAFE');
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it('will map a kernel RED_BLOCK to stable exit code 30', () => {
    const result = spawnSync(process.execPath, [
      bridge, '--project', repoRoot, '--phase', 'before-implement',
      '--runtime', 'opencode', '--action', 'push',
      '--command', 'git push --force origin main', '--json'
    ], { encoding: 'utf8' });
    assert.equal(result.status, 30);
    assert.equal(JSON.parse(result.stdout).classification, 'RED_BLOCK');
  });
});
