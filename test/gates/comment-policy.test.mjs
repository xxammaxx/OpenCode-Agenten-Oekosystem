/**
 * Comment Policy Tests (F-003)
 *
 * Validates:
 * - Authorized comment agents (who can post autonomous GitHub comments)
 * - Forbidden comment agents (who must produce evidence artifacts instead)
 * - Comment template validation (start, end, gate)
 * - Issue fetch enforcement
 * - External bot exclusion (CodeRabbit etc.)
 * - Policy restriction tightening (policies can only tighten, never expand)
 * - Gate comment commit + verdict requirements
 * - Comment cycle completeness
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  evaluateCommentPolicy,
  isExternalCommentIgnored,
  validateCommentPolicyRestriction,
  AUTHORIZED_COMMENT_AGENTS,
  FORBIDDEN_COMMENT_AGENTS,
  EXCLUDED_EXTERNAL_BOTS
} from '../../scripts/lib/gates/policy.mjs';

describe('Comment Policy Gates', () => {

  // ── Authorized Agent Tests ──────────────────────────────────

  it('allows issue-orchestrator to post start comments', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'issue-orchestrator',
      commentType: 'start',
      commentData: {
        context: 'test context',
        understanding: 'test understanding',
        planned_work: 'test work',
        tests_planned: 'test plans'
      },
      issueFetched: 'yes'
    });

    assert.strictEqual(result.violations.length, 0);
    assert.strictEqual(result.classification, 'GREEN_SAFE');
  });

  it('allows issue-orchestrator to post end comments', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'issue-orchestrator',
      commentType: 'end',
      commentData: {
        context: 'test',
        changes: 'test changes',
        files_changed: ['file1.js'],
        tests_run: 'all passed',
        result: 'success',
        blockers: []
      },
      issueFetched: 'yes'
    });

    assert.strictEqual(result.violations.length, 0);
    assert.strictEqual(result.classification, 'GREEN_SAFE');
  });

  it('allows security-agent to post gate comments with commit SHA', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'security-agent',
      commentType: 'gate',
      commentData: {
        verdict: 'PASS'
      },
      commitSha: 'abc123def456',
      issueFetched: 'yes'
    });

    assert.strictEqual(result.violations.length, 0);
    assert.strictEqual(result.classification, 'GREEN_SAFE');
  });

  it('allows compliance-agent to post gate comments', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'compliance-agent',
      commentType: 'gate',
      commentData: { verdict: 'PASS_WITH_NOTES' },
      commitSha: 'abc123',
      issueFetched: 'yes'
    });

    assert.strictEqual(result.violations.length, 0);
    assert.strictEqual(result.classification, 'GREEN_SAFE');
  });

  it('allows reviewer-agent to post final verdict', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'reviewer-agent',
      commentType: 'gate',
      commentData: { verdict: 'PASS' },
      commitSha: 'abc123',
      issueFetched: 'yes'
    });

    assert.strictEqual(result.violations.length, 0);
    assert.strictEqual(result.classification, 'GREEN_SAFE');
  });

  // ── Forbidden Agent Tests ──────────────────────────────────

  const forbiddenAgents = [
    'research-agent',
    'plan',
    'architecture-agent',
    'build',
    'documentation-agent',
    'playwright-agent'
  ];

  for (const agent of forbiddenAgents) {
    it(`blocks ${agent} from posting autonomous comments`, () => {
      const result = evaluateCommentPolicy({
        agentRole: agent,
        commentType: 'gate',
        commentData: { verdict: 'PASS' },
        commitSha: 'abc123',
        issueFetched: 'yes'
      });

      const agentViolation = result.violations.find(v => v.code === 'COMMENT_FORBIDDEN_AGENT');
      assert.ok(agentViolation, `Expected COMMENT_FORBIDDEN_AGENT violation for agent "${agent}"`);
      assert.strictEqual(result.classification, 'AMBER_REVIEW');
    });
  }

  it('warns for unknown agent role', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'custom-agent',
      commentType: 'gate',
      commentData: { verdict: 'PASS' },
      commitSha: 'abc123',
      issueFetched: 'yes'
    });

    const unknownWarning = result.warnings.find(w => w.code === 'COMMENT_UNKNOWN_AGENT');
    assert.ok(unknownWarning);
  });

  // ── Comment Template Validation ────────────────────────────

  it('validates start comment has all required fields', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'issue-orchestrator',
      commentType: 'start',
      commentData: {
        context: 'context only'  // Missing understanding, planned_work, tests_planned
      },
      issueFetched: 'yes'
    });

    // Should have violations for missing fields
    const missingFields = result.violations.filter(v => v.code === 'COMMENT_START_MISSING_FIELD');
    assert.ok(missingFields.length >= 3, `Expected at least 3 missing field violations, got ${missingFields.length}`);
  });

  it('validates end comment has all required fields', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'issue-orchestrator',
      commentType: 'end',
      commentData: {}  // All fields missing
    });

    const missingFields = result.violations.filter(v => v.code === 'COMMENT_END_MISSING_FIELD');
    assert.ok(missingFields.length >= 6, `Expected at least 6 missing field violations, got ${missingFields.length}`);
  });

  it('requires commit SHA for gate comments', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'security-agent',
      commentType: 'gate',
      commentData: { verdict: 'PASS' },
      commitSha: null,  // No commit SHA
      issueFetched: 'yes'
    });

    const noCommit = result.violations.find(v => v.code === 'COMMENT_GATE_NO_COMMIT');
    assert.ok(noCommit, 'Expected COMMENT_GATE_NO_COMMIT violation');
  });

  it('requires verdict for gate comments', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'security-agent',
      commentType: 'gate',
      commentData: {},  // No verdict
      commitSha: 'abc123',
      issueFetched: 'yes'
    });

    const noVerdict = result.violations.find(v => v.code === 'COMMENT_GATE_NO_VERDICT');
    assert.ok(noVerdict, 'Expected COMMENT_GATE_NO_VERDICT violation');
  });

  // ── Issue Fetch Enforcement ────────────────────────────────

  it('flags missing issue fetch', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'issue-orchestrator',
      commentType: 'start',
      commentData: {
        context: 'test',
        understanding: 'test',
        planned_work: 'test',
        tests_planned: 'test'
      },
      issueFetched: 'no'  // Issue not fetched
    });

    const fetchViolation = result.violations.find(v => v.code === 'COMMENT_ISSUE_NOT_FETCHED');
    assert.ok(fetchViolation, 'Expected COMMENT_ISSUE_NOT_FETCHED violation');
  });

  it('allows start comment when issue is fetched', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'issue-orchestrator',
      commentType: 'start',
      commentData: {
        context: 'test',
        understanding: 'test',
        planned_work: 'test',
        tests_planned: 'test'
      },
      issueFetched: 'yes'
    });

    const fetchViolation = result.violations.find(v => v.code === 'COMMENT_ISSUE_NOT_FETCHED');
    assert.strictEqual(fetchViolation, undefined);
  });

  // ── Comment Cycle Completeness ─────────────────────────────

  it('warns when issue is fetched but no comment cycle started', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'unknown',
      commentType: 'none',
      commentData: {},
      issueFetched: 'yes'
    });

    const cycleWarning = result.warnings.find(w => w.code === 'COMMENT_CYCLE_INCOMPLETE');
    assert.ok(cycleWarning, 'Expected COMMENT_CYCLE_INCOMPLETE warning');
  });

  // ── External Bot Exclusion ─────────────────────────────────

  it('detects CodeRabbit as external bot comment', () => {
    assert.ok(isExternalCommentIgnored('coderabbitai', ''));
    assert.ok(isExternalCommentIgnored('coderabbitai[bot]', ''));
    assert.ok(isExternalCommentIgnored('coderabbit', ''));
    assert.ok(isExternalCommentIgnored('some-user', '@coderabbitai review'));
  });

  it('does not flag human comments as external bots', () => {
    assert.strictEqual(isExternalCommentIgnored('xxammaxx', ''), false);
    assert.strictEqual(isExternalCommentIgnored('security-agent', ''), false);
    assert.strictEqual(isExternalCommentIgnored('reviewer-agent', 'Security review complete'), false);
  });

  it('warns when external review comments are present', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'issue-orchestrator',
      commentType: 'end',
      commentData: {
        context: 'test', changes: 'test', files_changed: [],
        tests_run: 'passed', result: 'success', blockers: []
      },
      issueFetched: 'yes',
      hasExternalReview: true
    });

    const extWarning = result.warnings.find(w => w.code === 'COMMENT_EXTERNAL_REVIEW_PRESENT');
    assert.ok(extWarning, 'Expected COMMENT_EXTERNAL_REVIEW_PRESENT warning');
  });

  // ── GREEN_SAFE without external review ─────────────────────

  it('achieves GREEN_SAFE without external review when all conditions met', () => {
    const result = evaluateCommentPolicy({
      agentRole: 'issue-orchestrator',
      commentType: 'start',
      commentData: {
        context: 'test',
        understanding: 'test',
        planned_work: 'test',
        tests_planned: 'test'
      },
      issueFetched: 'yes',
      hasExternalReview: false
    });

    assert.strictEqual(result.violations.length, 0);
    assert.strictEqual(result.classification, 'GREEN_SAFE');
  });

  it('does NOT require external review for GREEN_SAFE', () => {
    // Explicit: no external bot response is required for GREEN_SAFE
    const result = evaluateCommentPolicy({
      agentRole: 'issue-orchestrator',
      commentType: 'start',
      commentData: {
        context: 'test',
        understanding: 'test',
        planned_work: 'test',
        tests_planned: 'test'
      },
      issueFetched: 'yes',
      hasExternalReview: false
    });

    assert.strictEqual(result.classification, 'GREEN_SAFE');
  });

  // ── Policy Restriction Tightening ──────────────────────────

  it('rejects policy that expands authorized agents', () => {
    const result = validateCommentPolicyRestriction({
      commentPolicy: {
        authorizedAgentOverride: ['research-agent']  // Not in kernel list!
      }
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason.includes('Policies can only tighten'));
  });

  it('allows policy that adds forbidden agents (tightening)', () => {
    const result = validateCommentPolicyRestriction({
      commentPolicy: {
        forbiddenAgentOverride: ['custom-agent']  // Adding to forbidden = tightening
      }
    });
    assert.strictEqual(result.valid, true);
  });

  it('allows policy that restricts authorized agents (tightening)', () => {
    const result = validateCommentPolicyRestriction({
      commentPolicy: {
        authorizedAgentOverride: ['security-agent']  // Subset of kernel list = tightening
      }
    });
    assert.strictEqual(result.valid, true);
  });

  it('rejects policy that re-adds excluded external bots', () => {
    const result = validateCommentPolicyRestriction({
      commentPolicy: {
        authorizedAgentOverride: ['coderabbit']
      }
    });
    assert.strictEqual(result.valid, false);
  });

  // ── Immutability Checks ────────────────────────────────────

  it('AUTHORIZED_COMMENT_AGENTS is frozen (immutable)', () => {
    assert.throws(() => {
      AUTHORIZED_COMMENT_AGENTS.push('new-agent');
    }, /not extensible|read.only|frozen/i);
  });

  it('FORBIDDEN_COMMENT_AGENTS is frozen (immutable)', () => {
    assert.throws(() => {
      FORBIDDEN_COMMENT_AGENTS.push('new-agent');
    }, /not extensible|read.only|frozen/i);
  });

  it('EXCLUDED_EXTERNAL_BOTS is frozen (immutable)', () => {
    assert.throws(() => {
      EXCLUDED_EXTERNAL_BOTS.push('new-bot');
    }, /not extensible|read.only|frozen/i);
  });

  // ── CodeRabbit Exclusion ───────────────────────────────────

  it('CodeRabbit is in the excluded external bots list', () => {
    assert.ok(EXCLUDED_EXTERNAL_BOTS.includes('coderabbitai'));
    assert.ok(EXCLUDED_EXTERNAL_BOTS.includes('coderabbit'));
  });

  it('no CodeRabbit role is allowed in authorized agents', () => {
    assert.strictEqual(AUTHORIZED_COMMENT_AGENTS.includes('coderabbitai'), false);
    assert.strictEqual(AUTHORIZED_COMMENT_AGENTS.includes('coderabbit'), false);
  });

  it('no CodeRabbit command is recognized as valid', () => {
    assert.ok(isExternalCommentIgnored('any-user', '@coderabbitai review'));
    assert.ok(isExternalCommentIgnored('any-user', '@coderabbitai help'));
    assert.ok(isExternalCommentIgnored('coderabbitai', 'review in progress'));
  });

  // ── Agent Evidence Artifacts ───────────────────────────────

  it('forbidden agents must produce evidence artifacts (not comments)', () => {
    for (const agent of FORBIDDEN_COMMENT_AGENTS) {
      const result = evaluateCommentPolicy({
        agentRole: agent,
        commentType: 'gate',
        commentData: {},
        commitSha: 'abc123',
        issueFetched: 'yes'
      });
      const violation = result.violations.find(v => v.code === 'COMMENT_FORBIDDEN_AGENT');
      assert.ok(violation, `Expected forbidden agent violation for ${agent}`);
    }
  });

  // ── Old Sign-Offs Not Deleted ──────────────────────────────

  it('old sign-offs are not deleted by policy (superseding is allowed)', () => {
    // This is a documentation test: the policy allows superseding but never deletion
    // Superseding is handled by adding a new comment with "Supersedes: previous"
    // The policy does NOT have a "delete_old_signoffs" feature
    const result = evaluateCommentPolicy({
      agentRole: 'security-agent',
      commentType: 'gate',
      commentData: {
        verdict: 'PASS',
        supersedes: 'previous-security-signoff'
      },
      commitSha: 'newer-commit',
      issueFetched: 'yes'
    });

    // Policy allows superseding via metadata, never deletion
    assert.strictEqual(result.violations.length, 0);
  });
});
