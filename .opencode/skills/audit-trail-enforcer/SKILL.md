---
name: audit-trail-enforcer
description: Generates an immutable audit trail for every AI agent action. Logs agent decisions, tool calls, evidence collected, and human approvals. Provides cross-session traceability for compliance and debugging.
license: MIT
compatibility: opencode
metadata:
  audience: all
  workflow: audit
---
## Core Principle

Every AI agent decision that affects code, data, or configuration MUST leave an immutable audit trail. Without audit logs, compliance and debugging are impossible.

## What Gets Logged

### Tool Calls
```json
{
  "timestamp": "ISO8601",
  "session_id": "uuid",
  "agent": "agent-name",
  "tool": "tool-name",
  "args_summary": "hashed representation",
  "result_summary": "success|failure|denied",
  "duration_ms": 123
}
```

### Agent Decisions
```json
{
  "timestamp": "ISO8601",
  "session_id": "uuid",
  "agent": "agent-name",
  "decision_type": "severity_claim|architecture_choice|migration_approval|compliance_judgment",
  "decision": "what was decided",
  "evidence_refs": ["path/to/evidence1", "url/to/source"],
  "confidence": "HIGH|MEDIUM|LOW",
  "human_approved": true
}
```

### Evidence Collection
```json
{
  "timestamp": "ISO8601",
  "session_id": "uuid",
  "agent": "agent-name",
  "evidence_type": "poc_execution|cve_lookup|screenshot|log_capture|test_result",
  "source": "path/to/artifact",
  "hash": "sha256",
  "verified": true
}
```

### Delegation Events
```json
{
  "timestamp": "ISO8601",
  "session_id": "uuid",
  "parent_agent": "issue-orchestrator",
  "child_agent": "security-agent",
  "task_description": "short description",
  "delegation_reason": "why this agent was chosen"
}
```

## Log Locations
- Session logs: `.opencode/logs/sessions/<session_id>.jsonl`
- Audit logs: `.opencode/logs/audit/audit-YYYY-MM-DD.jsonl`
- Evidence cache: `.opencode/memory/evidence-cache.json`

## Retention
- Session logs: 30 days
- Audit logs: minimal local evidence, retention period defined by project-specific legal basis
- Evidence cache: 7 days
- No generic multi-year retention without project-specific legal requirement
- No secrets or PII in audit logs

## Verification
Audit logs can be verified by:
- Checking decision timestamp against evidence file timestamps
- Verifying evidence hash matches recorded hash
- Cross-referencing with GitHub issue comments (external verification)
- Checking human_approved flag for sensitive operations

## Prohibited
- Modifying audit logs after the fact (immutable by convention)
- Skipping logging for any tool call or decision
- Logging fabricated evidence references
