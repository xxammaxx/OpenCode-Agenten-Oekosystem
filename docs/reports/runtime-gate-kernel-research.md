# Runtime Gate Kernel — OpenCode & Hermes Research Report

**Datum:** 2026-07-15
**Context Level:** HOT
**Risk Tier:** HIGH_HUMAN_GATE

---

## 1. OpenCode Runtime Capabilities

### Quelle
- https://opencode.ai/docs/ (Permissions, Config, Agents, Skills, MCP, CLI, Providers)
- Lokale Dateien: `opencode.jsonc`, `.opencode/agents/*.md`, `.opencode/policies/*.json`
- `scripts/lib/opencode.mjs`

### KEY FINDINGS

| # | Finding | Confidence |
|---|---------|------------|
| 1 | Permission-System (`allow`/`ask`/`deny`) ersetzt deprecated `tools`-Key seit v1.1.1 | VERIFIED |
| 2 | Granulare Permissions: `read`, `edit`, `glob`, `grep`, `bash`, `task`, `external_directory`, `skill`, `webfetch`, `websearch` | VERIFIED |
| 3 | Config-Schema: `https://opencode.ai/config.json` | VERIFIED |
| 4 | Agents: JSON in `opencode.json` ODER Markdown in `.opencode/agents/<name>.md` | VERIFIED |
| 5 | Skills: `SKILL.md` mit YAML-Frontmatter in `.opencode/skills/<name>/` | VERIFIED |
| 6 | MCP: local (stdio) + remote (HTTP/SSE), OAuth-Support, DCR | VERIFIED |
| 7 | External Directory Gate: Jedes Tool außerhalb Worktree triggert `external_directory` Check | VERIFIED |
| 8 | Provider-Neutral: `provider/model-id` Format, 75+ Provider via AI SDK | VERIFIED |
| 9 | CLI: `opencode run`, `opencode debug config`, `--auto` flag | VERIFIED |
| 10 | Config Merging: Remote → Global → Project → .opencode/ directories | VERIFIED |

### Adaptionsstrategie
- `opencode.json`/`opencode.jsonc` + `.opencode/` sind primäre Detektionssignale
- Permissions strukturell prüfbar ohne CLI
- `permission` > `tools` Check als Kernel-Gate

---

## 2. Hermes Agent Runtime Capabilities

### Quelle
- https://hermes-agent.nousresearch.com/docs/ (Skills, Configuration, Security, MCP, Memory, CLI)
- Lokale Dateien: `.hermes/config.example.yaml`, `.hermes/skill-bundles/canonical-working-method.yaml`
- `ecosystem.manifest.json`, `BOOTSTRAP.md`

### KEY FINDINGS

| # | Finding | Confidence |
|---|---------|------------|
| 1 | Skills: `SKILL.md` in Kategorien unter `~/.hermes/skills/` | VERIFIED |
| 2 | `skills.write_approval: true` → staging unter `~/.hermes/pending/skills/` | VERIFIED |
| 3 | `memory.write_approval: true` → inline prompt oder staging | VERIFIED |
| 4 | MCP Toolfilter: per-Server `tools.include`/`exclude`, `tools.prompts`/`resources` boolean | VERIFIED |
| 5 | Sampling: `mcp_servers.<name>.sampling.enabled` per Server | VERIFIED |
| 6 | Skill Bundles: native YAML unter `~/.hermes/skill-bundles/` | VERIFIED |
| 7 | External Skill Dirs: `skills.external_dirs` — keine Write-Protection Boundary | VERIFIED |
| 8 | `/yolo`: umgeht Approval-Prompts, aber NICHT Hardline-Blocklist, `approvals.deny` oder Container-Boundary | VERIFIED |
| 9 | Detektionssignale: `.hermes.md`, `.hermes/`, `~/.hermes/config.yaml`, `~/.hermes/state.db` | VERIFIED |
| 10 | `TOOL_GAP_HERMES_RUNTIME` ist bereits dokumentierte Klassifikation | VERIFIED |

### Adaptionsstrategie
- `.hermes.md` + `.hermes/` + `~/.hermes/` als Detektionssignale
- `skills.write_approval` und `memory.write_approval` als Kernel-geführte Gates
- `/yolo` als unzulässiger Bypass klassifizieren
- Bestehende `TOOL_GAP_HERMES_RUNTIME` ehrlich übernehmen

---

## 3. Gemeinsame Adaptions-Punkte

| Aspekt | OpenCode | Hermes |
|--------|----------|--------|
| Skill-Format | `SKILL.md` YAML-Frontmatter | `SKILL.md` YAML-Frontmatter (kompatibel) |
| Agent-Definition | `.opencode/agents/*.md` | N/A (nutzt OpenCode Policies) |
| MCP-Konfiguration | `opencode.json` `mcp` key | `config.yaml` `mcp_servers` key |
| Detektionssignal | `opencode.json` / `.opencode/` | `.hermes.md` / `.hermes/` |
| Permission-Modell | `allow`/`ask`/`deny` pro Tool | Per-Server filter + hardline blocklist |
| Write-Approval | `permission.edit: "ask"` | `skills.write_approval: true` |

---

## Entscheidungszusammenfassung

### Gelesen
- Offizielle OpenCode-Dokumentation (Permissions, Agents, Skills, MCP, Config, CLI)
- Offizielle Hermes-Dokumentation (Skills, Security, MCP, Memory, CLI, Config)
- Lokale Projektdateien (opencode.jsonc, .hermes/, ecosystem.manifest.json)

### Validierte Fakten
- Beide Runtimes haben strukturell prüfbare Detektionssignale
- OpenCode `permission`-Modell ist granularer als Hermes `approvals`-Modell
- Hermes `/yolo` muss auf Kernel-Ebene blockiert werden
- Beide nutzen `SKILL.md` (wenn auch unterschiedlich implementiert)

### Entscheidung
- OpenCode-Adapter: Fokus auf Permission-Validation, deprecated-`tools`-Erkennung, Reviewer-read-only
- Hermes-Adapter: Fokus auf Write-Approval-Gates, `/yolo`-Block, MCP-Toolfilter, ehrlichen Runtime-Gap
- Gemeinsamer Contract: `detect()`, `capabilities()`, `validate()`, `evaluateRuntimeGates()`
