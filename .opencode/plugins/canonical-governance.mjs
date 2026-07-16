import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const PROJECT_ROOT = process.cwd();
const GOVERNANCE_ROOT = join(PROJECT_ROOT, '.agent-governance');
const MANIFEST_PATH = join(GOVERNANCE_ROOT, 'manifest.json');
const SOURCE_LOCK_PATH = join(GOVERNANCE_ROOT, 'source-lock.json');
const EVIDENCE_DIR = join(GOVERNANCE_ROOT, 'evidence');
const EVALUATE_PATH = join(GOVERNANCE_ROOT, 'runtime', 'evaluate-all.mjs');

const WRITE_TOOLS = new Set(['bash', 'write', 'edit', 'apply_patch', 'todowrite']);
const EXTERNAL_TOOLS = new Set(['webfetch', 'websearch']);
const DELEGATE_TOOLS = new Set(['task', 'skill']);
const READ_TOOLS = new Set(['read', 'grep', 'glob', 'lsp']);
const SAFE_TOOLS = new Set(['question', 'todowrite']);

let governanceInstalled = null;
let sourceLock = null;
let evaluateModule = null;

function governanceIsInstalled() {
  if (governanceInstalled !== null) return governanceInstalled;
  governanceInstalled = existsSync(MANIFEST_PATH);
  return governanceInstalled;
}

function loadSourceLock() {
  if (sourceLock !== null) return sourceLock;
  if (!existsSync(SOURCE_LOCK_PATH)) return null;
  try {
    sourceLock = JSON.parse(readFileSync(SOURCE_LOCK_PATH, 'utf-8'));
    return sourceLock;
  } catch {
    return null;
  }
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function validateRuntimeIntegrity() {
  const lock = loadSourceLock();
  if (!lock) return { valid: true, reason: 'no source lock present — integrity check skipped' };
  if (!lock.files || !Array.isArray(lock.files)) {
    return { valid: false, reason: 'source-lock.json missing files array — tampered' };
  }
  const mismatches = [];
  for (const entry of lock.files) {
    const filePath = join(GOVERNANCE_ROOT, entry.path);
    if (!existsSync(filePath)) {
      mismatches.push({ path: entry.path, reason: 'file missing' });
      continue;
    }
    const content = readFileSync(filePath, 'utf-8');
    const actualHash = sha256(content);
    if (actualHash !== entry.hash) {
      mismatches.push({ path: entry.path, expected: entry.hash, actual: actualHash });
    }
  }
  if (mismatches.length > 0) {
    return { valid: false, reason: 'runtime integrity check failed', mismatches };
  }
  return { valid: true };
}

async function loadEvaluateModule() {
  if (evaluateModule !== null) return evaluateModule;
  if (!existsSync(EVALUATE_PATH)) return null;
  try {
    evaluateModule = await import(EVALUATE_PATH);
    return evaluateModule;
  } catch (err) {
    console.error('[canonical-governance] failed to load evaluate-all.mjs:', err.message);
    return null;
  }
}

function classifyToolRisk(tool) {
  if (WRITE_TOOLS.has(tool)) return 'WRITE';
  if (EXTERNAL_TOOLS.has(tool)) return 'EXTERNAL';
  if (DELEGATE_TOOLS.has(tool)) return 'DELEGATE';
  if (READ_TOOLS.has(tool)) return 'READ';
  if (SAFE_TOOLS.has(tool)) return 'NON_BLOCKING';
  return 'UNKNOWN';
}

function determineBashAction(command) {
  const destrPatterns = [
    /rm\s+-rf/i,
    /git\s+push\s+--force/i,
    /DROP\s+TABLE/i,
    /DELETE\s+FROM/i,
    /docker\s+rm\s+-f/i,
    /format\s+[A-Z]:/i,
    /chmod\s+777/i,
  ];
  const writePatterns = [
    /write/i, />\s*/,
    /npm\s+(install|uninstall|update)/i,
    /pip\s+install/i,
    /git\s+(commit|add|tag|merge|rebase|reset)/i,
    /mkdir/i, /touch/i, /cp\s/i, /mv\s/i,
    /curl.*-o/i, /wget/i,
  ];
  const externalPatterns = [/curl\s/i, /wget\s/i, /nc\s/i, /telnet/i, /ssh\s/i];
  if (destrPatterns.some(p => p.test(command))) return 'destructive';
  if (externalPatterns.some(p => p.test(command))) return 'external';
  if (writePatterns.some(p => p.test(command))) return 'write';
  return 'read';
}

function mapToolToDescriptor(tool, args) {
  const base = { runtime: 'opencode', tool };

  switch (tool) {
    case 'bash':
      return { ...base, action: determineBashAction(args.command || args.description || ''), command: args.command, description: args.description };
    case 'write':
      return { ...base, action: 'write', writePath: args.filePath };
    case 'edit':
      return { ...base, action: 'write', writePath: args.filePath };
    case 'apply_patch':
      return { ...base, action: 'write', writePath: args.filePath };
    case 'todowrite':
      return { ...base, action: 'memory-write' };
    case 'read':
      return { ...base, action: 'read', readPath: args.filePath };
    case 'grep':
      return { ...base, action: 'read' };
    case 'glob':
      return { ...base, action: 'read' };
    case 'lsp':
      return { ...base, action: 'read' };
    case 'webfetch':
      return { ...base, action: 'external-fetch', url: args.url };
    case 'websearch':
      return { ...base, action: 'external-search' };
    case 'task':
      return { ...base, action: 'delegate', subagentType: args.subagent_type };
    case 'skill':
      return { ...base, action: 'delegate', skillName: args.name };
    case 'question':
      return { ...base, action: 'ask-user' };
    default:
      return { ...base, action: 'unknown', rawArgs: JSON.stringify(args) };
  }
}

async function evaluateByGate(descriptor) {
  const mod = await loadEvaluateModule();
  if (!mod || typeof mod.evaluateAllGates !== 'function') {
    return { decision: 'NOOP', reason: 'gate evaluator not available' };
  }
  try {
    const result = await mod.evaluateAllGates(descriptor);
    return result;
  } catch (err) {
    return { decision: 'ERROR', reason: `gate evaluation crashed: ${err.message}` };
  }
}

function writeEvidence(entry) {
  if (!governanceIsInstalled()) return;
  try {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = join(EVIDENCE_DIR, `decision-${ts}.json`);
    writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
  } catch {}
}

async function handleToolExecution(input, output) {
  const tool = input.tool;
  const risk = classifyToolRisk(tool);
  const descriptor = mapToolToDescriptor(tool, output.args || {});
  const installed = governanceIsInstalled();

  if (!installed) {
    if (risk === 'READ' || risk === 'NON_BLOCKING') {
      return undefined;
    }
    throw new Error(
      `[canonical-governance] BLOCKED: tool "${tool}" (${risk}) requires governance to be installed. ` +
      `Reason: write/external/delegate operations are blocked without .agent-governance/manifest.json in the workspace root.`
    );
  }

  const integrity = validateRuntimeIntegrity();
  if (!integrity.valid) {
    const evidenceEntry = {
      timestamp: new Date().toISOString(),
      decision: 'RED_BLOCK',
      reason: integrity.reason,
      tool,
      risk,
      mismatches: integrity.mismatches || null,
    };
    writeEvidence(evidenceEntry);
    throw new Error(
      `[canonical-governance] BLOCKED: governance runtime integrity compromised. ` +
      `${integrity.reason}. TAMPER_DETECTED.`
    );
  }

  let gateResult;
  try {
    gateResult = await evaluateByGate(descriptor);
  } catch (err) {
    const evidenceEntry = {
      timestamp: new Date().toISOString(),
      decision: 'RED_BLOCK',
      reason: `gate evaluation threw: ${err.message}`,
      tool,
      risk,
      descriptor,
    };
    writeEvidence(evidenceEntry);

    if (risk === 'WRITE' || risk === 'EXTERNAL') {
      throw new Error(
        `[canonical-governance] BLOCKED: gate evaluation crashed for tool "${tool}" (${risk}). ` +
        `Fail-closed enforcement triggered. Details: ${err.message}`
      );
    }
    return undefined;
  }

  const decision = gateResult?.decision || 'UNKNOWN';

  const evidenceEntry = {
    timestamp: new Date().toISOString(),
    decision,
    tool,
    risk,
    descriptor,
    gateReason: gateResult?.reason || null,
    gateDetails: gateResult || null,
  };
  writeEvidence(evidenceEntry);

  switch (decision) {
    case 'GREEN':
    case 'ALLOW':
    case 'NOOP':
      return undefined;

    case 'RED_BLOCK':
    case 'DENY':
    case 'BLOCK':
      throw new Error(
        `[canonical-governance] BLOCKED: tool "${tool}" (${risk}) blocked by gate: ` +
        `${gateResult.reason || 'policy violation'}.`
      );

    case 'AMBER_REVIEW':
    case 'APPROVAL_REQUIRED':
    case 'HUMAN_GATE':
      throw new Error(
        `[canonical-governance] BLOCKED: tool "${tool}" (${risk}) requires human approval. ` +
        `${gateResult.reason || 'approval required by gate policy'}.`
      );

    case 'ERROR':
      if (risk === 'WRITE' || risk === 'EXTERNAL') {
        throw new Error(
          `[canonical-governance] BLOCKED: gate evaluation error for tool "${tool}" (${risk}). ` +
          `Fail-closed enforcement triggered. ${gateResult.reason || ''}`
        );
      }
      return undefined;

    default:
      if (risk === 'WRITE' && decision !== 'GREEN') {
        throw new Error(
          `[canonical-governance] BLOCKED: unknown gate decision "${decision}" for tool "${tool}" (${risk}). ` +
          `Fail-closed for write operations.`
        );
      }
      return undefined;
  }
}

export const hooks = {
  'tool.execute.before': async function (input, output) {
    return handleToolExecution(input, output);
  },
};
