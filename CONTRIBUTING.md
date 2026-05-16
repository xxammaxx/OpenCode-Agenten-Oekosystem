# Contributing

This repository is designed to be installed into OpenCode and used as a shared agent ecosystem.

## Before you change anything

1. Read [AGENTS.md](AGENTS.md).
2. Read [SECURITY.md](SECURITY.md).
3. Read [opencode.jsonc](opencode.jsonc).
4. If the change touches architecture, APIs, SDKs, MCP, providers, or security, use the read-before-sketch rule.
5. Use the linked GitHub issue as the source of truth for implementation work.

## Install on another computer

Clone the repository and run:

```bash
node scripts/install-global.mjs
```

The installer backs up any existing `~/.config/opencode` configuration before copying the repo's OpenCode files.

## Workflow

- No implementation without issue context.
- No architectural change without documented tradeoffs.
- No change without tests or a clear reason tests could not run.
- Do not commit secrets or local runtime artifacts.
