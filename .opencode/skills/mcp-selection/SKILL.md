---
name: mcp-selection
description: Selects minimal MCP servers, keeps them disabled by default, and records trust-tier reasoning.
license: MIT
compatibility: opencode
metadata:
  audience: bootstrap
  workflow: mcp
  hermes: compatible
---

## When To Use

Use this skill whenever MCP servers are considered for a project.

## Workflow

1. Classify MCP candidates into trust tiers.
2. Prefer read-only Tier 0 tools.
3. Keep Tier 1 and Tier 2 servers disabled unless explicitly requested.
4. Warn about credentials and installation methods.
5. Refuse uncontrolled `npx -y` installs.

## Inputs

- discovery signals
- credentials availability
- manifest catalog
- remote CI opt-in flag

## Outputs

- MCP recommendation list
- config snippets with `enabled: false`
- trust-tier justification

## Security Boundaries

- no wildcard tool grants
- no automatic activation
- no secret storage in the manifest
- no uncontrolled package installation

## Completion Criteria

- every selected MCP has a reason
- every MCP is disabled by default
- human approval is required where trust is higher

