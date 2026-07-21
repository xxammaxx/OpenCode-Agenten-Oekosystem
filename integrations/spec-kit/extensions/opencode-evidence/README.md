# opencode-evidence

This extension adds evidence-oriented OpenCode commands to Spec Kit 0.13.x.

The extension does not contain a second security kernel. Commands delegate to
`scripts/evaluate-operation.mjs` from the ecosystem checkout resolved through
the explicit `OPENCODE_AGENT_ECOSYSTEM_ROOT` environment variable. The
launcher rejects missing, relative, symlinked, or out-of-scope roots.

`extension.yml` hooks are advisory. They may be ignored by an agent. The
`opencode-safe-delivery` workflow and the runtime-neutral kernel are required
for enforcement.

For local development:

```bash
export OPENCODE_AGENT_ECOSYSTEM_ROOT=/absolute/path/to/OpenCode-Agenten-Oekosystem
specify extension add --dev ./integrations/spec-kit/extensions/opencode-evidence
```

Remote CI is disabled by default. No command in this extension publishes,
pushes, commits, or changes global configuration.
