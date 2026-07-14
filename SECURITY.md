# Security Policy

## Supported Versions

The current repository tip is supported with security updates.

## Reporting A Vulnerability

If you discover a security issue, do not open a public issue. Use a private security advisory or contact the maintainer through the repository security channel.

## Secrets Management

Sensitive configuration is managed exclusively via environment variables or the user’s existing secret store.

### Prohibited Practices

- Never commit `.env` files or real secrets to version control.
- Never hardcode API keys, tokens, passwords, or signed URLs in source code.
- Never log sensitive values to stdout or log files.
- Never expose secrets in error messages.

### Principle

- The bootstrap must never read secret contents to make a routing decision.
- Discovery should use file presence and non-secret metadata only.
- Reports should redact any values that may have been discovered incidentally.

## MCP Security

See `.opencode/policies/mcp-trust-tiers.json` for the trust-tier model.

Key principles:

- All MCP servers start disabled.
- Tier 0 is the default for unknown MCPs.
- Tier 1 MCPs are sandboxed and remain opt-in.
- Tier 2 MCPs require a human approval gate.
- No uncontrolled `npx -y` execution.

## Dependency Security

- Run local validation before every release.
- Review dependency changes for unexpected updates.
- Prefer pinned versions when a dependency is required.

## Agent Security

- Agents never have write access to production data.
- Evidence gates prevent hallucinated security claims.
- Audit trails track every AI decision.
- Human-in-the-loop for destructive operations.
- Cross-agent validation for critical claims.
