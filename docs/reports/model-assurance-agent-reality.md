# Agent Reality Report — PR #7 Remediation & Model Assurance

## Execution Ownership

```yaml
execution:
  implementation_owner: main-opencode-session
  test_implementation_owner: main-opencode-session
  test_execution_owner: main-opencode-session
```

## Available Agents (Confirmed)

| Agent | .md File | JSON Config | Mode | Verifiable |
|-------|----------|-------------|------|------------|
| `issue-orchestrator` | YES | YES | primary | YES — active in this session |
| `review-agent` | YES | YES (subagent) | subagent | YES |
| `research-agent` | YES | YES (subagent) | subagent | YES |
| `compliance-agent` | YES | YES (subagent) | subagent | YES |
| `migration-agent` | YES | YES (subagent) | subagent | YES |
| `playwright-agent` | YES | YES (subagent) | subagent | YES |
| `architecture-agent` | YES | YES (subagent) | subagent | YES |
| `security-agent` | YES | YES (subagent) | subagent | YES |
| `documentation-agent` | YES | YES (subagent) | subagent | YES |

## Unavailable / Non-Callable Agents

| Agent | Reason | Rule |
|-------|--------|------|
| **`build`** | Exists in JSON config as `primary` mode, but has NO `.md` prompt file. Per CRITICAL_REMEDIATION order: "KEINEN BUILD-AGENTEN — darf nicht aufgerufen, simuliert oder in Logs behauptet werden." | **DO NOT CALL** |
| **`test` / `test-agent`** | Does NOT exist in JSON config, no `.md` file, no references in AGENTS.md or ecosystem.manifest.json. | **DOES NOT EXIST** |
| **`plan`** | Exists in JSON config as `primary` mode (temperature 0.0, no edit, read-only). Has NO `.md` prompt file. The orchestrator may engage plan as an analysis agent (per WORKING-METHOD.md delegation rules), but the main session remains the implementation owner. | **Analysis only, no implementation** |

## Agent Call Policy

1. **No agent may be invented.** Only the agents listed above as "Available" may be used.
2. **`build` agent is PROHIBITED** from being called, simulated, logged, or claimed as executed.
3. **`test`/`test-agent` is PROHIBITED** — it does not exist.
4. The **main OpenCode session** owns all implementation, test writing, and test execution.
5. Subagents are used only for their documented specializations (review, research, security, compliance, architecture, documentation).

## Hard Gate

```text
RED_BLOCK_INVENTED_AGENT_ACCEPTED = Hard-Gate violation
Any invented agent call = immediate RED_BLOCK.
```

## Validation Date

2026-07-21 (Europe/Berlin)

## Source of Truth

- Project agent config: `.opencode/agents/*.md` (9 files)
- Project JSON config: `opencode.jsonc` (12 agent entries, 11 with names)
- Global agent config: `~/.config/opencode/agents/` (9 files)
- Global JSON config: `~/.config/opencode/opencode.json`
