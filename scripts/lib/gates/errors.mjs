/**
 * Gate Kernel Error Types
 * Immutable error hierarchy for all gate evaluation failures.
 *
 * Each error type carries:
 * - code: Unique machine-readable code (NO_GATE_ prefix for kernel gates)
 * - gateId: Which gate this error belongs to
 * - message: Human-readable explanation
 * - evidence: Structured evidence of the violation
 * - severity: RED_BLOCK, AMBER_REVIEW, TOOL_GAP
 */

// ── Base Gate Error ──────────────────────────────────────────────

export class GateError extends Error {
  constructor({ code, gateId, message, evidence = {}, severity = 'RED_BLOCK' }) {
    super(message);
    this.name = 'GateError';
    this.code = code;
    this.gateId = gateId;
    this.evidence = Object.freeze({ ...evidence });
    this.severity = severity;
    this.timestamp = new Date().toISOString();
  }
}

// ── Kernel Gate Violations (always RED_BLOCK) ────────────────────

export class KernelGateViolation extends GateError {
  constructor({ code, gateId, message, evidence = {} }) {
    super({ code, gateId, message, evidence, severity: 'RED_BLOCK' });
    this.name = 'KernelGateViolation';
  }
}

export class ForcePushViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_FORCE_PUSH',
      gateId: 'NO_FORCE_PUSH',
      message: 'Force push is unconditionally blocked by kernel gate.',
      evidence
    });
    this.name = 'ForcePushViolation';
  }
}

export class SecretLeakViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_SECRET_LEAK',
      gateId: 'NO_SECRET_LEAK',
      message: 'Secret leakage detected — blocked by kernel gate.',
      evidence
    });
    this.name = 'SecretLeakViolation';
  }
}

export class PathEscapeViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_PATH_ESCAPE',
      gateId: 'NO_PATH_ESCAPE',
      message: 'Path escape attempt detected — blocked by kernel gate.',
      evidence
    });
    this.name = 'PathEscapeViolation';
  }
}

export class SymlinkEscapeViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_SYMLINK_ESCAPE',
      gateId: 'NO_SYMLINK_ESCAPE',
      message: 'Symlink escape attempt detected — blocked by kernel gate.',
      evidence
    });
    this.name = 'SymlinkEscapeViolation';
  }
}

export class UnrelatedWorktreeWriteViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_UNRELATED_WORKTREE_WRITE',
      gateId: 'NO_UNRELATED_WORKTREE_WRITE',
      message: 'Attempted write outside authorized worktree scope.',
      evidence
    });
    this.name = 'UnrelatedWorktreeWriteViolation';
  }
}

export class ProductionWriteViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_PRODUCTION_WRITE',
      gateId: 'NO_PRODUCTION_WRITE_WITHOUT_APPROVAL',
      message: 'Production write attempted without valid approval receipt.',
      evidence
    });
    this.name = 'ProductionWriteViolation';
  }
}

export class RemoteActionViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_REMOTE_ACTION',
      gateId: 'NO_REMOTE_ACTION_WITHOUT_SCOPED_APPROVAL',
      message: 'Remote action attempted without scoped approval receipt.',
      evidence
    });
    this.name = 'RemoteActionViolation';
  }
}

export class FalseGreenViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_FALSE_GREEN',
      gateId: 'NO_FALSE_GREEN',
      message: 'False-GREEN classification detected — kernel gate blocked.',
      evidence
    });
    this.name = 'FalseGreenViolation';
  }
}

export class FakeExecutionViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_FAKE_EXECUTION',
      gateId: 'NO_FAKE_EXECUTION',
      message: 'Fake execution detected — no actual tool was run, but result was claimed.',
      evidence
    });
    this.name = 'FakeExecutionViolation';
  }
}

export class ReviewerWriteViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_REVIEWER_WRITE',
      gateId: 'NO_REVIEWER_WRITE',
      message: 'Reviewer agent attempted write operation — kernel gate blocked.',
      evidence
    });
    this.name = 'ReviewerWriteViolation';
  }
}

export class ApplyWithoutBackupViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_APPLY_WITHOUT_BACKUP',
      gateId: 'NO_APPLY_WITHOUT_BACKUP',
      message: 'Apply operation attempted without prior backup — kernel gate blocked.',
      evidence
    });
    this.name = 'ApplyWithoutBackupViolation';
  }
}

export class RollbackWithoutManifestViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_ROLLBACK_WITHOUT_MANIFEST',
      gateId: 'NO_ROLLBACK_WITHOUT_VALIDATED_MANIFEST',
      message: 'Rollback attempted without validated manifest — kernel gate blocked.',
      evidence
    });
    this.name = 'RollbackWithoutManifestViolation';
  }
}

export class ApprovalReuseViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_APPROVAL_REUSE',
      gateId: 'NO_APPROVAL_REUSE',
      message: 'Single-use approval receipt already consumed — replay blocked.',
      evidence
    });
    this.name = 'ApprovalReuseViolation';
  }
}

export class CrossActionApprovalViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_CROSS_ACTION_APPROVAL',
      gateId: 'NO_CROSS_ACTION_APPROVAL',
      message: 'Approval for one action used for a different action — blocked by kernel gate.',
      evidence
    });
    this.name = 'CrossActionApprovalViolation';
  }
}

export class CrossScopeApprovalViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_CROSS_SCOPE_APPROVAL',
      gateId: 'NO_CROSS_SCOPE_APPROVAL',
      message: 'Approval with mismatched scope (branch/repository/paths) — blocked.',
      evidence
    });
    this.name = 'CrossScopeApprovalViolation';
  }
}

export class ExpiredApprovalViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_EXPIRED_APPROVAL',
      gateId: 'NO_EXPIRED_APPROVAL',
      message: 'Approval receipt has expired — blocked by kernel gate.',
      evidence
    });
    this.name = 'ExpiredApprovalViolation';
  }
}

export class RuntimeAdapterOverrideViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_RUNTIME_ADAPTER_OVERRIDE',
      gateId: 'NO_RUNTIME_ADAPTER_OVERRIDE',
      message: 'Runtime adapter attempted to override or weaken a kernel gate — blocked.',
      evidence
    });
    this.name = 'RuntimeAdapterOverrideViolation';
  }
}

export class GlobalRuntimeConfigWriteViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_GLOBAL_RUNTIME_CONFIG_WRITE',
      gateId: 'NO_GLOBAL_RUNTIME_CONFIG_WRITE',
      message: 'Attempted write to global runtime configuration — kernel gate blocked.',
      evidence
    });
    this.name = 'GlobalRuntimeConfigWriteViolation';
  }
}

export class AGPLIncorporationViolation extends KernelGateViolation {
  constructor({ evidence = {} } = {}) {
    super({
      code: 'NO_GATE_AGPL_INCORPORATION',
      gateId: 'NO_AGPL_INCORPORATION',
      message: 'AGPL-licensed source code incorporation detected — kernel gate blocked.',
      evidence
    });
    this.name = 'AGPLIncorporationViolation';
  }
}

// ── Policy Gate Violations (AMBER_REVIEW) ─────────────────────────

export class PolicyGateViolation extends GateError {
  constructor({ code, gateId, message, evidence = {} }) {
    super({ code, gateId, message, evidence, severity: 'AMBER_REVIEW' });
    this.name = 'PolicyGateViolation';
  }
}

// ── Tool Gap (TOOL_GAP) ───────────────────────────────────────────

export class ToolGapError extends GateError {
  constructor({ code, gateId, message, evidence = {} }) {
    super({ code, gateId, message, evidence, severity: 'TOOL_GAP' });
    this.name = 'ToolGapError';
  }
}

// ── Re-export all error classes ───────────────────────────────────

export const ALL_KERNEL_VIOLATIONS = [
  ForcePushViolation,
  SecretLeakViolation,
  PathEscapeViolation,
  SymlinkEscapeViolation,
  UnrelatedWorktreeWriteViolation,
  ProductionWriteViolation,
  RemoteActionViolation,
  FalseGreenViolation,
  FakeExecutionViolation,
  ReviewerWriteViolation,
  ApplyWithoutBackupViolation,
  RollbackWithoutManifestViolation,
  ApprovalReuseViolation,
  CrossActionApprovalViolation,
  CrossScopeApprovalViolation,
  ExpiredApprovalViolation,
  RuntimeAdapterOverrideViolation,
  GlobalRuntimeConfigWriteViolation,
  AGPLIncorporationViolation
];
