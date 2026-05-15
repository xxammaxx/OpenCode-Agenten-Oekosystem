# Security Policy

## Supported Versions

The latest release is currently supported with security updates.

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow responsible disclosure:

1. **Do not** open a public GitHub issue
2. Email the maintainer or open a private security advisory at:
   https://github.com/xxammaxx/OpenCode-Agenten-Oekosystems/security/advisories/new

We will acknowledge receipt within 48 hours and provide an estimated timeline for a fix.

## Secrets Management

### Environment Variables

Sensitive configuration is managed exclusively via environment variables:

| Variable | Purpose | Required |
|----------|---------|----------|
| `GITHUB_TOKEN` | GitHub API authentication | Yes |
| `ANTHROPIC_API_KEY` | Anthropic Claude API | For cloud models |
| `BRAVE_API_KEY` | Brave Search MCP | For research agent |
| `OPENAI_API_KEY` | OpenAI API (optional) | No |
| `NODE_ENV` | Runtime environment | Yes |

### Prohibited Practices
- **Never** commit `.env` files or real secrets to version control
- **Never** hardcode API keys, tokens, or passwords in source code
- **Never** log sensitive values to stdout or log files
- **Never** expose secrets in error messages

### Secret Rotation
- GitHub tokens should be rotated every 90 days minimum
- Immediately revoke any token that may have been exposed
- Use fine-grained tokens with minimal required permissions

## MCP Security

See `.opencode/policies/mcp-trust-tiers.json` for the complete MCP security model.

Key principles:
- All MCP servers start disabled, enabled per-agent
- Tier 0 (Readonly) is the default for unknown MCPs
- Tier 1 (Sandboxed) MCPs run with Docker security constraints
- Tier 2 (Trusted) requires human approval gate

## Dependency Security
- `npm audit` should be run before every release
- Dependencies should be updated regularly
- Review `package-lock.json` changes for unexpected dependency changes
- Pin dependency versions in production

## Agent Security
- Agents never have write access to production data
- Evidence gates prevent hallucinated security claims
- Audit trails track every AI decision
- Human-in-the-loop for all destructive operations
- Cross-agent validation for critical claims
