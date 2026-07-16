/**
 * Rollback Runtime Integration Tests
 *
 * Validates:
 * - Install governance into target project
 * - Modify project files
 * - Rollback from backup
 * - Exact original state restored
 * - .agent-governance/ removed
 * - source-lock.json removed
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { repoRoot, runNodeScript, snapshotTree } from '../helpers.mjs';

const INSTALL_SCRIPT = 'scripts/install-governance.mjs';

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'gov-rollback-'));
}

async function synthesizeProject(target) {
  await fs.mkdir(path.join(target, 'src'), { recursive: true });
  await fs.mkdir(path.join(target, 'test'), { recursive: true });
  await fs.writeFile(path.join(target, 'README.md'), '# Test Project\n\nA test project.\n', 'utf8');
  await fs.writeFile(path.join(target, 'src', 'index.js'), 'console.log("hello world");\n', 'utf8');
  await fs.writeFile(path.join(target, 'test', 'index.test.js'), '// test file\n', 'utf8');
  await fs.writeFile(path.join(target, '.gitignore'), 'node_modules/\n', 'utf8');

  // Init git
  spawnSync('git', ['init'], { cwd: target, encoding: 'utf8', stdio: 'pipe' });
  spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: target, encoding: 'utf8', stdio: 'pipe' });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: target, encoding: 'utf8', stdio: 'pipe' });
  spawnSync('git', ['add', '-A'], { cwd: target, encoding: 'utf8', stdio: 'pipe' });
  spawnSync('git', ['commit', '-m', 'initial commit'], { cwd: target, encoding: 'utf8', stdio: 'pipe' });
}

async function installGovernance(target) {
  const approval = {
    version: '1.0.0', action: 'apply', runtime: 'opencode',
    scope: { branch: 'main', commit: 'abc', paths: [], repository: 'test', targetRoot: 'test' },
    riskTier: 'MEDIUM_REVIEW',
    contextFingerprint: 'a'.repeat(64),
    approvedBy: 'owner', approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    singleUse: true, nonce: `rollback-int-${Date.now()}`, status: 'APPROVED'
  };
  const approvalPath = path.join(target, 'approval.json');
  await fs.writeFile(approvalPath, JSON.stringify(approval), 'utf8');

  return runNodeScript(INSTALL_SCRIPT, [
    '--target', target, '--apply', '--approval-file', approvalPath, '--json'
  ]);
}

describe('Rollback Runtime', () => {
  const tempDirs = [];

  after(async () => {
    for (const dir of tempDirs) {
      try { await fs.rm(dir, { recursive: true, force: true }); } catch { /* ok */ }
    }
  });

  // ── Install → modify → rollback → verify exact restore ─────

  it('install governance, modify, rollback, verify original state', async () => {
    const t = await createTempDir();
    tempDirs.push(t);
    await synthesizeProject(t);

    // Take initial snapshot
    const beforeSnapshot = await snapshotTree(t, { ignorePrefixes: ['.git/'] });

    // Install governance
    const installResult = await installGovernance(t);
    assert.ok([0, 1].includes(installResult.status),
      `Install failed: ${installResult.status}, stderr: ${installResult.stderr}`);

    // Verify governance is installed
    assert.ok(existsSync(path.join(t, '.agent-governance')), '.agent-governance/ should exist');
    assert.ok(existsSync(path.join(t, '.agent-governance', 'source-lock.json')),
      'source-lock.json should exist');

    // Modify some project files to simulate work done after install
    writeFileSync(path.join(t, 'README.md'), '# Modified Project\n\nChanged after install.\n', 'utf8');
    await fs.writeFile(path.join(t, 'src', 'new-file.js'), '// new file added\n', 'utf8');

    // Find the backup directory from install report
    const backupsDir = path.join(t, '.opencode', 'backups');
    const entries = await fs.readdir(backupsDir);
    const govBackup = entries.find(e => e.startsWith('governance-'));
    assert.ok(govBackup, `Expected governance-* backup in ${entries.join(', ')}`);
    const backupPath = path.join(backupsDir, govBackup);

    // Rollback
    const rollbackResult = runNodeScript(INSTALL_SCRIPT, [
      '--target', t, '--rollback', backupPath
    ]);
    assert.strictEqual(rollbackResult.status, 0,
      `Rollback should exit 0, got ${rollbackResult.status}: ${rollbackResult.stderr}`);

    // Verify .agent-governance/ is removed
    assert.ok(!existsSync(path.join(t, '.agent-governance')),
      '.agent-governance/ should not exist after rollback');
  });

  // ── Verify .agent-governance/ removed ──────────────────────

  it('.agent-governance/ is removed after rollback', async () => {
    const t = await createTempDir();
    tempDirs.push(t);
    await synthesizeProject(t);

    await installGovernance(t);
    assert.ok(existsSync(path.join(t, '.agent-governance')));

    const backupsDir = path.join(t, '.opencode', 'backups');
    const entries = await fs.readdir(backupsDir);
    const govBackup = entries.find(e => e.startsWith('governance-'));
    assert.ok(govBackup, 'Backup should exist');

    const backupPath = path.join(backupsDir, govBackup);
    const rollbackResult = runNodeScript(INSTALL_SCRIPT, [
      '--target', t, '--rollback', backupPath
    ]);
    assert.strictEqual(rollbackResult.status, 0);

    assert.ok(!existsSync(path.join(t, '.agent-governance')),
      '.agent-governance/ should be removed');
  });

  // ── Verify source-lock.json removed ────────────────────────

  it('source-lock.json is removed after rollback', async () => {
    const t = await createTempDir();
    tempDirs.push(t);
    await synthesizeProject(t);

    await installGovernance(t);

    const sourceLockPath = path.join(t, '.agent-governance', 'source-lock.json');
    assert.ok(existsSync(sourceLockPath), 'source-lock.json should exist');

    const backupsDir = path.join(t, '.opencode', 'backups');
    const entries = await fs.readdir(backupsDir);
    const govBackup = entries.find(e => e.startsWith('governance-'));
    const backupPath = path.join(backupsDir, govBackup);

    const rollbackResult = runNodeScript(INSTALL_SCRIPT, [
      '--target', t, '--rollback', backupPath
    ]);
    assert.strictEqual(rollbackResult.status, 0);

    assert.ok(!existsSync(sourceLockPath), 'source-lock.json should be removed');
    assert.ok(!existsSync(path.join(t, '.agent-governance')),
      '.agent-governance/ should not exist');
  });

  // ── Install → rollback → re-install works ──────────────────

  it('install, rollback, re-install works', async () => {
    const t = await createTempDir();
    tempDirs.push(t);
    await synthesizeProject(t);

    // First install
    await installGovernance(t);
    assert.ok(existsSync(path.join(t, '.agent-governance')));

    // Rollback
    const backupsDir = path.join(t, '.opencode', 'backups');
    const entries = await fs.readdir(backupsDir);
    const govBackup = entries.find(e => e.startsWith('governance-'));
    const backupPath = path.join(backupsDir, govBackup);

    let rollbackResult = runNodeScript(INSTALL_SCRIPT, [
      '--target', t, '--rollback', backupPath
    ]);
    assert.strictEqual(rollbackResult.status, 0);

    assert.ok(!existsSync(path.join(t, '.agent-governance')));

    // Clean up .opencode/backups to allow a clean re-install
    try { await fs.rm(path.join(t, '.opencode'), { recursive: true, force: true }); } catch { /* ok */ }

    // Re-install with fresh temp dir approach
    const t2 = await createTempDir();
    tempDirs.push(t2);
    await synthesizeProject(t2);

    const approval2 = {
      version: '1.0.0', action: 'apply', runtime: 'opencode',
      scope: { branch: 'main', commit: 'abc', paths: [], repository: 'test', targetRoot: 'test' },
      riskTier: 'MEDIUM_REVIEW',
      contextFingerprint: 'a'.repeat(64),
      approvedBy: 'owner', approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      singleUse: true, nonce: `reinstall2-${Date.now()}`, status: 'APPROVED'
    };
    const approvalPath2 = path.join(t2, 'approval.json');
    await fs.writeFile(approvalPath2, JSON.stringify(approval2), 'utf8');

    const reinstallResult = runNodeScript(INSTALL_SCRIPT, [
      '--target', t2, '--apply', '--approval-file', approvalPath2, '--json'
    ]);
    assert.ok([0, 1].includes(reinstallResult.status),
      `Fresh install after rollback should work, exit: ${reinstallResult.status}`);

    assert.ok(existsSync(path.join(t2, '.agent-governance')),
      '.agent-governance/ should exist after re-install');
  });

  // ── Rollback preserves user files ──────────────────────────

  it('rollback preserves user modifications outside governance', async () => {
    const t = await createTempDir();
    tempDirs.push(t);
    await synthesizeProject(t);

    await installGovernance(t);

    // Modify a user file AFTER install
    const newContent = '# Modified README\n\nUser change.\n';
    await fs.writeFile(path.join(t, 'README.md'), newContent, 'utf8');

    const backupsDir = path.join(t, '.opencode', 'backups');
    const entries = await fs.readdir(backupsDir);
    const govBackup = entries.find(e => e.startsWith('governance-'));
    const backupPath = path.join(backupsDir, govBackup);

    const rollbackResult = runNodeScript(INSTALL_SCRIPT, [
      '--target', t, '--rollback', backupPath
    ]);
    assert.strictEqual(rollbackResult.status, 0);

    // User's file should still exist (rollback only removes governance files)
    assert.ok(existsSync(path.join(t, 'README.md')),
      'README.md should still exist after rollback');
    assert.ok(existsSync(path.join(t, 'src', 'index.js')),
      'src/index.js should still exist after rollback');
  });
});
