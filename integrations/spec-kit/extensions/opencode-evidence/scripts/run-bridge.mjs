#!/usr/bin/env node
/** argv-only launcher for the canonical ecosystem bridge. */
import { existsSync, lstatSync, realpathSync, statSync, writeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { safeRedactText, safeSerialize, secretValuesFromEnv } from '../../../../../scripts/lib/security/redaction.mjs';

const rootValue = process.env.OPENCODE_AGENT_ECOSYSTEM_ROOT;
const projectRoot = resolve(process.cwd());
if (!rootValue || !isAbsolute(rootValue)) {
  writeSync(2, 'OPENCODE_AGENT_ECOSYSTEM_ROOT must be an absolute path.\n');
  process.exit(40);
}

const root = resolve(rootValue);
if (!existsSync(root) || !statSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) {
  writeSync(2, 'Configured ecosystem root is not a real directory.\n');
  process.exit(40);
}
const canonicalRoot = realpathSync(root);
if (canonicalRoot !== root) {
  writeSync(2, 'Configured ecosystem root canonicalization mismatch.\n');
  process.exit(40);
}
const bridge = resolve(canonicalRoot, 'scripts/evaluate-operation.mjs');
if (!existsSync(bridge) || lstatSync(bridge).isSymbolicLink()) {
  writeSync(2, 'Canonical bridge is missing or symlinked.\n');
  process.exit(40);
}

const args = process.argv.slice(2);
const redactionOptions = { secrets: secretValuesFromEnv() };
const result = spawnSync(process.execPath, [bridge, '--project', projectRoot, ...args], {
  cwd: projectRoot,
  env: { ...process.env },
  encoding: 'utf8',
  shell: false,
  stdio: 'pipe'
});
const fallback = safeSerialize({
  schema_version: '1.0',
  classification: 'RED_BLOCK',
  allowed: false,
  blocked_by: [{ code: 'UNSAFE_BRIDGE_OUTPUT', message: 'Bridge output was suppressed.' }],
  exit_code: typeof result.status === 'number' ? result.status : 50
}, redactionOptions);
const redactedStdout = safeRedactText(result.stdout || '', redactionOptions);
let stdout = redactedStdout;
let stdoutValid = false;
try {
  JSON.parse(redactedStdout);
  stdoutValid = true;
} catch {
  stdout = fallback;
}
writeSync(1, stdout.endsWith('\n') ? stdout : `${stdout}\n`);
if (!stdoutValid) writeSync(2, 'Bridge output suppressed: missing or invalid JSON.\n');
if (result.stderr) writeSync(2, safeRedactText(result.stderr, redactionOptions));
if (result.error) writeSync(2, `Bridge process error: ${safeRedactText(safeSerialize(result.error, redactionOptions), redactionOptions)}\n`);
process.exitCode = typeof result.status === 'number' ? result.status : 50;
