---
name: hermes-handoff
description: Packages OpenCode bootstrap context into Hermes-friendly portable bundles and gateway notes.
license: MIT
compatibility: opencode
metadata:
  audience: bootstrap
  workflow: hermes
  hermes: compatible
---

## When To Use

Use this skill when Hermes should consume the same project bootstrap context as OpenCode.

## Workflow

1. Collect the selected skills and run card.
2. Generate a portable Hermes bundle.
3. Write `.hermes.md` and bundle notes.
4. Document how to start Hermes explicitly.
5. Keep the gateway disabled unless requested.

## Inputs

- selected skill names
- discovery report
- run card
- MCP recommendations

## Outputs

- `.hermes.md`
- `.hermes/README.md`
- `.hermes/bundles/*.json`
- `.hermes/mcp/*.md`

## Security Boundaries

- do not rewrite `~/.hermes` automatically
- do not enable an MCP gateway without review
- do not copy remote CI by default

## Completion Criteria

- Hermes assets are portable
- bundle contents are explicit
- gateway remains opt-in

