# Research Findings

## Scope

This report records the validated facts collected before implementation.

## Validated Facts

### OpenCode

- OpenCode supports JSON and JSONC config files.
- Project config is merged with global and remote config rather than replacing it.
- `.opencode/` and `~/.config/opencode/` use plural subdirectories such as `agents/`, `skills/`, `plugins/`, and `tools/`.
- OpenCode supports local and remote MCP servers.
- MCP servers are disabled by default unless explicitly enabled.
- Agent skills are discovered from `SKILL.md` files and loaded on demand.
- Skill frontmatter is strict: `name`, `description`, `license`, `compatibility`, and `metadata` are the recognized fields.
- Agent config supports `mode`, `permission`, `model`, `temperature`, `tools`, and other options.

Source:

- OpenCode docs, Config: https://opencode.ai/docs/config/
- OpenCode docs, Agents: https://opencode.ai/docs/agents/
- OpenCode docs, Skills: https://opencode.ai/docs/skills/
- OpenCode docs, MCP servers: https://opencode.ai/docs/mcp-servers/
- OpenCode docs, Permissions: https://opencode.ai/docs/permissions/

### Hermes Agent

- The installed Hermes binary is available locally as `hermes`.
- Installed version: `Hermes Agent v0.18.2 (2026.7.7.2)`.
- Hermes exposes `--skills`, `--toolsets`, `--worktree`, `--safe-mode`, `--accept-hooks`, `mcp serve`, `bundles create`, `skills snapshot export/import`, and `config path`.
- Hermes config lives in `~/.hermes/config.yaml`.
- Hermes env file path is `~/.hermes/.env`.
- Hermes can run as an MCP server via `hermes mcp serve`.
- Hermes bundles can be created from named skills and can prepend instructions.

Source:

- Local primary source: `hermes --help`
- Local primary source: `hermes config --help`
- Local primary source: `hermes mcp --help`
- Local primary source: `hermes bundles --help`
- Local primary source: `hermes skills snapshot --help`

### Repository State

- The repository currently has uncommitted changes in `README.md` and `opencode.jsonc`.
- The current branch is `master`.
- The remote is `origin` at `https://github.com/xxammaxx/OpenCode-Agenten-Oekosystem.git`.
- No open GitHub issues were returned by `gh issue list`.
- `gh pr list` could not complete because the GitHub API was unreachable in this environment.

## Explicit Uncertainties

- No public official Hermes documentation site was found during web search.
- Hermes project-local file layout is therefore inferred from the installed CLI behavior and the repository's own bootstrap requirements.
- `gh pr list` connectivity failed, so repository PR state could not be fully verified.

## Implications For Implementation

- OpenCode config should be merged structurally and not replaced.
- Skill frontmatter should remain valid and minimal.
- MCPs should default to disabled.
- Model/provider configuration should remain optional and user-owned.
- Hermes should be treated as a portable bundle/runtime handoff, not as a globally rewritten user config.
