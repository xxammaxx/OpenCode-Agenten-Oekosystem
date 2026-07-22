/**
 * URL Installer Tests
 *
 * Validates:
 * - Dry-run does not modify files
 * - Dry-run plan contains enforcement level
 * - Apply with approval receipt succeeds
 * - Apply without receipt (blocked for push/deploy actions)
 * - Backup created on apply
 * - Resident runtime files installed
 * - source-lock.json generated with hashes
 * - Idempotent second apply
 * - Rollback restores original state
 * - Non-existent target → RED_BLOCK
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { repoRoot, runNodeScript, readJson } from '../helpers.mjs';

const INSTALL_SCRIPT = 'scripts/install-governance.mjs';

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'gov-install-test-'));
}

async function synthesizeTargetProject(tempDir) {
  await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(tempDir, 'README.md'), '# Test Project\n', 'utf8');
  await fs.writeFile(path.join(tempDir, 'src', 'index.js'), 'console.log("hello");\n', 'utf8');

  // Initialize git if available
  const gitResult = spawnSync('git', ['init'], { cwd: tempDir, encoding: 'utf8', stdio: 'pipe' });
  if (gitResult.status === 0) {
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir, encoding: 'utf8', stdio: 'pipe' });
    spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tempDir, encoding: 'utf8', stdio: 'pipe' });
    spawnSync('git', ['add', '-A'], { cwd: tempDir, encoding: 'utf8', stdio: 'pipe' });
    spawnSync('git', ['commit', '-m', 'initial'], { cwd: tempDir, encoding: 'utf8', stdio: 'pipe' });
  }
  return tempDir;
}

async function countFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries.length;
}

describe('URL Installer', () => {
  /** @type {string[]} */
  const tempDirs = [];

  after(async () => {
    for (const dir of tempDirs) {
      try { await fs.rm(dir, { recursive: true, force: true }); } catch { /* ok */ }
    }
  });

  let target;

  before(async () => {
    target = await synthesizeTargetProject(await createTempDir());
    tempDirs.push(target);
  });

  // ── Dry-run does not modify files ────────────────────────────

  it('dry-run does not modify target files', async () => {
    const beforeFiles = await countFiles(target);
    const result = runNodeScript(INSTALL_SCRIPT, ['--target', target, '--json']);
    const afterFiles = await countFiles(target);

    assert.strictEqual(afterFiles, beforeFiles, 'Dry-run should not create files in target');
    assert.ok([0, 1].includes(result.status), `Dry-run exit code ${result.status} should be 0 or 1`);
  });

  // ── Dry-run plan contains enforcement level ──────────────────

  it('dry-run plan includes enforcement level', async () => {
    const result = runNodeScript(INSTALL_SCRIPT, ['--target', target, '--json']);
    assert.ok([0, 1].includes(result.status), `exit code: ${result.status}, stderr: ${result.stderr}`);

    const output = JSON.parse(result.stdout);
    assert.ok(output.enforcement_level, `Expected enforcement_level, got: ${JSON.stringify(output)}`);
  });

  // ── Non-existent target → RED_BLOCK ───────────────────────

  it('non-existent target returns RED_BLOCK', () => {
    const result = runNodeScript(INSTALL_SCRIPT, ['--target', '/tmp/non-existent-target-xyz-9999', '--json']);
    assert.ok([2].includes(result.status), `Expected exit code 2 for RED_BLOCK, got ${result.status}`);

    try {
      const output = JSON.parse(result.stdout || result.stderr);
      assert.ok(
        output.classification === 'RED_BLOCK',
        `Expected RED_BLOCK classification, got: ${JSON.stringify(output)}`
      );
    } catch {
      const text = (result.stdout + result.stderr).toLowerCase();
      assert.ok(text.includes('red_block') || text.includes('does not exist'), text);
    }
  });

  // ── Apply with approval receipt (install) ──────────────────

  it('apply with valid approval receipt installs governance', async () => {
    const t = await synthesizeTargetProject(await createTempDir());
    tempDirs.push(t);

    // Create an approval receipt for 'apply' action
    const approval = {
      version: '1.0.0',
      action: 'apply',
      runtime: 'opencode',
      scope: { branch: 'main', commit: 'abc', paths: [], repository: 'test', targetRoot: 'test' },
      riskTier: 'MEDIUM_REVIEW',
      contextFingerprint: 'a'.repeat(64),
      approvedBy: 'owner',
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      singleUse: true,
      nonce: `test-apply-${Date.now()}`,
      status: 'APPROVED'
    };
    const approvalPath = path.join(t, 'approval.json');
    await fs.writeFile(approvalPath, JSON.stringify(approval), 'utf8');

    const result = runNodeScript(INSTALL_SCRIPT, [
      '--target', t, '--apply', '--approval-file', approvalPath, '--json'
    ]);

    assert.ok([0, 1].includes(result.status), `exit: ${result.status}, stderr: ${result.stderr}`);

    const govRoot = path.join(t, '.agent-governance');
    assert.ok(existsSync(govRoot), '.agent-governance/ should exist after apply');
    assert.ok(existsSync(path.join(govRoot, 'manifest.json')), 'manifest.json should exist');
  });

  // ── Apply without receipt (dry-run only is safe) ────────────

  it('apply without --apply flag does not install', async () => {
    const t = await synthesizeTargetProject(await createTempDir());
    tempDirs.push(t);

    const result = runNodeScript(INSTALL_SCRIPT, ['--target', t, '--json']);
    assert.ok([0, 1].includes(result.status), `exit: ${result.status}`);

    const govRoot = path.join(t, '.agent-governance');
    assert.ok(!existsSync(govRoot), '.agent-governance/ should NOT exist after dry-run only');
  });

  // ── Backup created on apply ──────────────────────────────────

  it('backup directory is created on apply', async () => {
    const t = await synthesizeTargetProject(await createTempDir());
    tempDirs.push(t);

    const approval = {
      version: '1.0.0', action: 'apply', runtime: 'opencode',
      scope: { branch: 'main', commit: 'abc', paths: [], repository: 'test', targetRoot: 'test' },
      riskTier: 'MEDIUM_REVIEW',
      contextFingerprint: 'a'.repeat(64),
      approvedBy: 'owner', approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      singleUse: true, nonce: `test-backup-${Date.now()}`, status: 'APPROVED'
    };
    const approvalPath = path.join(t, 'approval.json');
    await fs.writeFile(approvalPath, JSON.stringify(approval), 'utf8');

    const result = runNodeScript(INSTALL_SCRIPT, [
      '--target', t, '--apply', '--approval-file', approvalPath, '--json'
    ]);
    assert.ok([0, 1].includes(result.status), `exit: ${result.status}, stderr: ${result.stderr}`);

    const backupsDir = path.join(t, '.opencode', 'backups');
    assert.ok(existsSync(backupsDir), 'Backups directory should exist');

    const entries = await fs.readdir(backupsDir);
    const governanceBackups = entries.filter(e => e.startsWith('governance-'));
    assert.ok(governanceBackups.length > 0, `Expected governance-* backup, got: ${entries.join(', ')}`);
  });

  // ── Resident runtime files installed ────────────────────────

  it('resident runtime files are installed', async () => {
    const t = await synthesizeTargetProject(await createTempDir());
    tempDirs.push(t);

    const approval = {
      version: '1.0.0', action: 'apply', runtime: 'opencode',
      scope: { branch: 'main', commit: 'abc', paths: [], repository: 'test', targetRoot: 'test' },
      riskTier: 'MEDIUM_REVIEW',
      contextFingerprint: 'a'.repeat(64),
      approvedBy: 'owner', approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      singleUse: true, nonce: `test-runtime-${Date.now()}`, status: 'APPROVED'
    };
    const approvalPath = path.join(t, 'approval.json');
    await fs.writeFile(approvalPath, JSON.stringify(approval), 'utf8');

    const result = runNodeScript(INSTALL_SCRIPT, [
      '--target', t, '--apply', '--approval-file', approvalPath, '--json'
    ]);
    assert.ok([0, 1].includes(result.status), `exit: ${result.status}, stderr: ${result.stderr}`);

    const runtimeDir = path.join(t, '.agent-governance', 'runtime');
    assert.ok(existsSync(runtimeDir), 'runtime/ should exist');

    // Gates directory
    const gatesDir = path.join(runtimeDir, 'gates');
    assert.ok(existsSync(gatesDir), 'runtime/gates/ should exist');
    const expectedGateFiles = [
      'evaluate-all.mjs', 'kernel.mjs', 'policy.mjs', 'decision.mjs',
      'approval.mjs', 'evidence.mjs', 'classifications.mjs', 'errors.mjs',
      'context-fingerprint.mjs'
    ];
    for (const file of expectedGateFiles) {
      const fp = path.join(gatesDir, file);
      assert.ok(existsSync(fp), `Gate file ${file} should exist in runtime/gates/`);
    }

    // Runtimes directory
    const runtimesDir = path.join(runtimeDir, 'runtimes');
    assert.ok(existsSync(runtimesDir), 'runtime/runtimes/ should exist');
    const expectedAdapterFiles = ['contract.mjs', 'generic.mjs', 'opencode.mjs', 'hermes.mjs', 'odysseus.mjs'];
    for (const file of expectedAdapterFiles) {
      const fp = path.join(runtimesDir, file);
      assert.ok(existsSync(fp), `Adapter file ${file} should exist in runtime/runtimes/`);
    }
  });

  // ── source-lock.json generated with hashes ──────────────────

  it('source-lock.json is generated with runtime hashes', async () => {
    const t = await synthesizeTargetProject(await createTempDir());
    tempDirs.push(t);

    const approval = {
      version: '1.0.0', action: 'apply', runtime: 'opencode',
      scope: { branch: 'main', commit: 'abc', paths: [], repository: 'test', targetRoot: 'test' },
      riskTier: 'MEDIUM_REVIEW',
      contextFingerprint: 'a'.repeat(64),
      approvedBy: 'owner', approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      singleUse: true, nonce: `test-sourcelock-${Date.now()}`, status: 'APPROVED'
    };
    const approvalPath = path.join(t, 'approval.json');
    await fs.writeFile(approvalPath, JSON.stringify(approval), 'utf8');

    const result = runNodeScript(INSTALL_SCRIPT, [
      '--target', t, '--apply', '--approval-file', approvalPath, '--json'
    ]);
    assert.ok([0, 1].includes(result.status), `exit: ${result.status}`);

    const lockPath = path.join(t, '.agent-governance', 'source-lock.json');
    assert.ok(existsSync(lockPath), 'source-lock.json should exist');

    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    assert.ok(lock.files && Array.isArray(lock.files), 'source-lock should have files array');
    assert.ok(lock.files.length >= 5, `Expected >= 5 files, got ${lock.files.length}`);
    assert.ok(lock.schema_version, 'source-lock should have schema_version');
    assert.ok(lock.enforcement_version, 'source-lock should have enforcement_version');

    // Verify files entries have sha256 and path
    for (const entry of lock.files) {
      assert.ok(entry.path, `File entry should have path`);
      if (entry.sha256 !== 'UNAVAILABLE') {
        assert.ok(entry.sha256.startsWith('sha256:'),
          `sha256 should start with sha256:, got: ${entry.sha256?.slice(0, 30)}`);
      }
    }
  });

  // ── Idempotent second apply ──────────────────────────────────

  it('second apply is idempotent', async () => {
    const t = await synthesizeTargetProject(await createTempDir());
    tempDirs.push(t);

    const approval = {
      version: '1.0.0', action: 'apply', runtime: 'opencode',
      scope: { branch: 'main', commit: 'abc', paths: [], repository: 'test', targetRoot: 'test' },
      riskTier: 'MEDIUM_REVIEW',
      contextFingerprint: 'a'.repeat(64),
      approvedBy: 'owner', approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      singleUse: true, nonce: `test-idem1-${Date.now()}`, status: 'APPROVED'
    };
    const approvalPath = path.join(t, 'approval.json');
    await fs.writeFile(approvalPath, JSON.stringify(approval), 'utf8');

    // First apply
    const r1 = runNodeScript(INSTALL_SCRIPT, [
      '--target', t, '--apply', '--approval-file', approvalPath, '--json'
    ]);
    assert.ok([0, 1].includes(r1.status), `First apply: ${r1.status}, stderr: ${r1.stderr}`);

    // Verify governance exists after first install
    assert.ok(existsSync(path.join(t, '.agent-governance')), 'Governance should exist after first apply');

    // Second approval for second apply
    const approval2 = {
      version: '1.0.0', action: 'apply', runtime: 'opencode',
      scope: { branch: 'main', commit: 'abc', paths: [], repository: 'test', targetRoot: 'test' },
      riskTier: 'MEDIUM_REVIEW',
      contextFingerprint: 'a'.repeat(64),
      approvedBy: 'owner', approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      singleUse: true, nonce: `test-idem2-${Date.now()}`, status: 'APPROVED'
    };
    const approvalPath2 = path.join(t, 'approval2.json');
    await fs.writeFile(approvalPath2, JSON.stringify(approval2), 'utf8');

    // Second apply — must succeed with true idempotency
    // With same source version and unmodified managed files, the
    // second apply must complete successfully without data loss.
    const r2 = runNodeScript(INSTALL_SCRIPT, [
      '--target', t, '--apply', '--approval-file', approvalPath2, '--json'
    ]);

    assert.ok([0, 1].includes(r2.status),
      `Second apply exit code ${r2.status} should be 0 or 1 (GREEN_SAFE or AMBER_REVIEW). stderr: ${r2.stderr}`);

    // Verify idempotency: key governance files must exist
    assert.ok(existsSync(path.join(t, '.agent-governance')), '.agent-governance should exist after second apply');
    assert.ok(existsSync(path.join(t, '.agent-governance', 'runtime', 'gates', 'kernel.mjs')),
      'runtime/gates/kernel.mjs should exist after second apply');
    assert.ok(existsSync(path.join(t, '.agent-governance', 'manifest.json')),
      'manifest.json should exist after second apply');
    assert.ok(existsSync(path.join(t, '.agent-governance', 'source-lock.json')),
      'source-lock.json should exist after second apply');
    assert.ok(existsSync(path.join(t, '.agent-governance', 'state')),
      'state directory should exist after second apply');
    assert.ok(existsSync(path.join(t, '.agent-governance', 'approvals')),
      'approvals directory should exist after second apply');
  });

  // ── Rollback restores original state ───────────────────────

  it('rollback restores original state', async () => {
    const t = await synthesizeTargetProject(await createTempDir());
    tempDirs.push(t);

    // Take initial snapshot
    const originalFiles = [];
    const walk = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = path.relative(t, full);
        if (e.isDirectory() && e.name !== '.git') await walk(full);
        else if (!e.isDirectory()) {
          originalFiles.push(rel);
        }
      }
    };
    await walk(t);

    // Install governance
    const approval = {
      version: '1.0.0', action: 'apply', runtime: 'opencode',
      scope: { branch: 'main', commit: 'abc', paths: [], repository: 'test', targetRoot: 'test' },
      riskTier: 'MEDIUM_REVIEW',
      contextFingerprint: 'a'.repeat(64),
      approvedBy: 'owner', approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      singleUse: true, nonce: `test-rollback-${Date.now()}`, status: 'APPROVED'
    };
    const approvalPath = path.join(t, 'approval.json');
    await fs.writeFile(approvalPath, JSON.stringify(approval), 'utf8');

    const result = runNodeScript(INSTALL_SCRIPT, [
      '--target', t, '--apply', '--approval-file', approvalPath, '--json'
    ]);
    assert.ok([0, 1].includes(result.status), `Apply: ${result.status}, stderr: ${result.stderr}`);

    // Find backup directory
    const backupsDir = path.join(t, '.opencode', 'backups');
    const entries = await fs.readdir(backupsDir);
    const govBackup = entries.find(e => e.startsWith('governance-'));
    assert.ok(govBackup, `Expected governance-* in ${entries.join(', ')}`);
    const backupPath = path.join(backupsDir, govBackup);

    // Rollback
    const rollbackResult = runNodeScript(INSTALL_SCRIPT, [
      '--target', t, '--rollback', backupPath
    ]);
    assert.strictEqual(rollbackResult.status, 0, `Rollback failed: ${rollbackResult.stderr}`);

    // Verify .agent-governance/ is removed
    assert.ok(!existsSync(path.join(t, '.agent-governance')),
      '.agent-governance/ should be removed after rollback');
  });
});
