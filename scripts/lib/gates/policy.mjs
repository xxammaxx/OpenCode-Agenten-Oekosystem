// SPDX-License-Identifier: MIT
/**
 * Policy Gate Evaluator (Layer 2)
 *
 * Evaluates configurable policy gates that can only ADD restrictions,
 * never remove kernel gate protections (Layer 1).
 *
 * Policy gates enforce:
 * - GitHub comment behavior (start/end gate enforcement)
 * - Issue fetch requirements
 * - Comment template validation
 * - Agent comment role authorization
 * - External review bot exclusion
 *
 * Key invariants:
 * - No runtime policy can weaken kernel gates
 * - Policy gates only tighten, never loosen
 * - Comment roles are immutable (cannot be extended at runtime)
 * - External review bots are never required for GREEN_SAFE
 * - CodeRabbit/AI-review bots are blocked from the review pipeline
 */

// ── Comment Role Definitions ───────────────────────────────────────

/** Agents AUTHORIZED to post structured GitHub comments autonomously */
const AUTHORIZED_COMMENT_AGENTS = Object.freeze([
  'issue-orchestrator',   // Start, Blocker, Abschluss
  'security-agent',        // Security-Gate verdict
  'compliance-agent',      // Compliance-/Lizenz-Gate verdict
  'reviewer-agent'         // Final unabhängiges Verdict
]);

/** Agents that MUST NOT post autonomous GitHub comments */
const FORBIDDEN_COMMENT_AGENTS = Object.freeze([
  'research-agent',
  'plan',          // Planungsagent
  'architecture-agent',
  'build',         // Build-Agent
  'documentation-agent',
  'playwright-agent'
]);

/** Comment templates that must be present for valid comments */
const REQUIRED_COMMENT_FIELDS = {
  start: ['context', 'understanding', 'planned_work', 'tests_planned'],
  end: ['context', 'changes', 'files_changed', 'tests_run', 'result', 'blockers'],
  gate: ['commit', 'verdict']  // Gate comments reference specific commit + verdict
};

/** Excluded external review bots (never part of the review pipeline) */
const EXCLUDED_EXTERNAL_BOTS = Object.freeze([
  'coderabbitai',
  'coderabbit'
]);

/** External bot comments classified as HISTORICAL_EXTERNAL_COMMENT */
function isExternalBotComment(author, body = '') {
  const authorLower = (author || '').toLowerCase();
  const bodyLower = body.toLowerCase();

  if (EXCLUDED_EXTERNAL_BOTS.some(bot => authorLower.includes(bot))) {
    return true;
  }
  if (EXCLUDED_EXTERNAL_BOTS.some(bot => bodyLower.includes(bot))) {
    return true;
  }
  return false;
}

// ── Comment Policy Gates ───────────────────────────────────────────

/**
 * Evaluate comment policy for an operation context.
 * Returns findings that classify comment compliance.
 *
 * @param {object} context
 * @param {string} context.agentRole - e.g. "issue-orchestrator", "security-agent"
 * @param {string} context.commentType - "start" | "end" | "gate" | "none"
 * @param {object} context.commentData - structured comment fields
 * @param {string} context.issueFetched - whether the GitHub issue was fetched ("yes" | "no")
 * @param {string} context.commitSha - commit SHA for gate comments
 * @param {boolean} context.hasExternalReview - whether external bot review exists
 * @returns {object} { violations: [], warnings: [], classification: string }
 */
export function evaluateCommentPolicy(context = {}) {
  const violations = [];
  const warnings = [];

  const {
    agentRole = 'unknown',
    commentType = 'none',
    commentData = {},
    issueFetched = 'no',
    commitSha = null,
    hasExternalReview = false
  } = context;

  // ── Issue Fetch Check ──
  if (issueFetched !== 'yes') {
    violations.push({
      code: 'COMMENT_ISSUE_NOT_FETCHED',
      message: 'GitHub issue was not fetched before implementation. Start Gate requires online issue context.',
      severity: 'AMBER_REVIEW'
    });
  }

  // ── Agent Role Authorization ──
  if (commentType !== 'none') {
    if (FORBIDDEN_COMMENT_AGENTS.includes(agentRole)) {
      violations.push({
        code: 'COMMENT_FORBIDDEN_AGENT',
        message: `Agent "${agentRole}" is not authorized to post autonomous GitHub comments. Must produce versioned evidence artifacts instead.`,
        severity: 'AMBER_REVIEW'
      });
    } else if (!AUTHORIZED_COMMENT_AGENTS.includes(agentRole) && agentRole !== 'unknown') {
      warnings.push({
        code: 'COMMENT_UNKNOWN_AGENT',
        message: `Agent "${agentRole}" is not in the authorized comment list. Verify manually.`,
        severity: 'AMBER_REVIEW'
      });
    }
  }

  // ── Start Comment Validation ──
  if (commentType === 'start') {
    for (const field of REQUIRED_COMMENT_FIELDS.start) {
      if (!commentData[field]) {
        violations.push({
          code: 'COMMENT_START_MISSING_FIELD',
          message: `Start comment is missing required field: "${field}". Template requires: ${REQUIRED_COMMENT_FIELDS.start.join(', ')}`,
          severity: 'AMBER_REVIEW'
        });
      }
    }
  }

  // ── End Comment Validation ──
  if (commentType === 'end') {
    for (const field of REQUIRED_COMMENT_FIELDS.end) {
      if (!commentData[field]) {
        violations.push({
          code: 'COMMENT_END_MISSING_FIELD',
          message: `End comment is missing required field: "${field}". Template requires: ${REQUIRED_COMMENT_FIELDS.end.join(', ')}`,
          severity: 'AMBER_REVIEW'
        });
      }
    }
  }

  // ── Gate Comment Validation ──
  if (commentType === 'gate') {
    if (!commitSha) {
      violations.push({
        code: 'COMMENT_GATE_NO_COMMIT',
        message: 'Gate comments must reference the commit SHA they apply to.',
        severity: 'AMBER_REVIEW'
      });
    }
    if (!commentData.verdict) {
      violations.push({
        code: 'COMMENT_GATE_NO_VERDICT',
        message: 'Gate comments must include a verdict (PASS / PASS_WITH_NOTES / CHANGES_REQUIRED / BLOCK).',
        severity: 'AMBER_REVIEW'
      });
    }
  }

  // ── External Bot Exclusion ──
  if (hasExternalReview) {
    warnings.push({
      code: 'COMMENT_EXTERNAL_REVIEW_PRESENT',
      message: 'External review bot comments detected. These are classified as HISTORICAL_EXTERNAL_COMMENT — not evaluated, not used as gates.',
      severity: 'INFO'
    });
  }

  // ── Comment Cycle Completeness ──
  if (commentType === 'none' && issueFetched === 'yes') {
    warnings.push({
      code: 'COMMENT_CYCLE_INCOMPLETE',
      message: 'Issue was fetched but no comment cycle started. Start Gate requires a structured start comment.',
      severity: 'WARNING'
    });
  }

  // ── Classification ──
  const classification = violations.length > 0
    ? 'AMBER_REVIEW'
    : warnings.length > 0
      ? 'AMBER_REVIEW'
      : 'GREEN_SAFE';

  return {
    violations,
    warnings,
    classification,
    meta: {
      authorizedAgents: [...AUTHORIZED_COMMENT_AGENTS],
      forbiddenAgents: [...FORBIDDEN_COMMENT_AGENTS],
      excludedBots: [...EXCLUDED_EXTERNAL_BOTS]
    }
  };
}

/**
 * Check if an external comment should be ignored (not evaluated, not used as gate).
 */
export function isExternalCommentIgnored(author, body = '') {
  return isExternalBotComment(author, body);
}

/**
 * Validate that a comment policy configuration cannot expand authorized agents.
 * Policy files can only RESTRICT, never ADD to the authorized list.
 */
export function validateCommentPolicyRestriction(policyConfig) {
  if (!policyConfig || !policyConfig.commentPolicy) return { valid: true };

  const { authorizedAgentOverride, forbiddenAgentOverride } = policyConfig.commentPolicy;

  // Policy can ADD forbidden agents (more restrictive), but NOT add authorized agents
  if (authorizedAgentOverride) {
    for (const agent of authorizedAgentOverride) {
      if (!AUTHORIZED_COMMENT_AGENTS.includes(agent)) {
        return {
          valid: false,
          reason: `Policy attempts to authorize agent "${agent}" not in the kernel-authorized list. Policies can only tighten, not expand.`
        };
      }
    }
  }

  // Policy can ADD additional forbidden agents (tightening)
  // No validation needed — adding to forbidden is always allowed

  return { valid: true };
}

// ── Exports ────────────────────────────────────────────────────────

export {
  AUTHORIZED_COMMENT_AGENTS,
  FORBIDDEN_COMMENT_AGENTS,
  EXCLUDED_EXTERNAL_BOTS,
  REQUIRED_COMMENT_FIELDS
};
