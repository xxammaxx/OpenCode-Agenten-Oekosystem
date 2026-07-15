# Contributing

This repository is a universal bootstrap kit for OpenCode and Hermes Agent.

## Before You Change Anything

1. Read [AGENTS.md](AGENTS.md).
2. Read [SECURITY.md](SECURITY.md).
3. Read [BOOTSTRAP.md](BOOTSTRAP.md).
4. Read [ecosystem.manifest.json](ecosystem.manifest.json).
5. If the change touches architecture, APIs, SDKs, MCP, providers, or security, use the read-before-sketch rule.

## Bootstrap Modes

- Use `node scripts/bootstrap-project.mjs --target <project>` for a dry-run.
- Add `--apply` only after reviewing the generated plan.
- Add `--include-remote-ci` only when you explicitly want remote CI proposals.
- Use `node scripts/install-global.mjs` only for the user-wide OpenCode mirror, not for target-project bootstrapping.

## Workflow

- Prefer a GitHub issue when GitHub context exists.
- Use the local run report when GitHub access is unavailable.
- No architectural change without documented tradeoffs.
- No change without tests or a clear reason tests could not run.
- Do not commit secrets or local runtime artifacts.
