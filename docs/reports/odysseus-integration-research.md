# Odysseus Integration Research Report

**Datum:** 2026-07-15
**Repository:** https://github.com/odysseus-dev/odysseus
**Examined Branch:** `dev` (default; `main` stable)
**License:** AGPL-3.0-or-later
**Classification:** RESEARCH_ONLY — no code incorporation

---

## 1. Repository Structure

### DEFAULT BRANCH: `dev` (bleeding-edge); `main` (curated stable)

### Key Directories (FACT)
| Directory | Purpose |
|-----------|---------|
| `app.py` | FastAPI entry point |
| `core/` | auth, database, middleware, constants |
| `src/` | agent loop, tool execution, memory, MCP, security |
| `routes/` | FastAPI route modules |
| `services/` | shell, search, docs, memory, stt, tts |
| `integrations/` | claude/ + codex/ external agent bridges |
| `companion/` | LAN discovery + mobile pairing bridge |
| `mcp_servers/` | built-in MCP server definitions |
| `docker/` | GPU overlays, entrypoint, host-docker overlay |
| `tests/` | pytest with area taxonomy markers |
| `data/` | runtime data (presets.json, skills.json, memory.json, etc.) |

### Detection Fingerprint (FACT)
| Signal | Confidence | Unique to Odysseus? |
|--------|-----------|---------------------|
| `integrations/claude/` + `integrations/codex/` | 98% | Yes — distinctive bridge pattern |
| `companion/` | 98% | Yes — unique LAN pairing module |
| `app.py` + `core/auth.py` + `src/constants.py` | 95% | Yes — characteristic architecture |
| `src/preset_manager.py` | 90% | Yes — preset-based config |
| `docker-compose.yml` with `ody-cookbook` | 85% | Yes — distinctive service name |
| `src/builtin_mcp.py` | 80% | Yes — auto-registration |
| `routes/skills_routes.py` | 90% | Strong signal |
| Generic: `pyproject.toml` + `requirements.txt` | 65% | No — ambiguous alone |
| Generic: `Dockerfile` + `docker-compose.yml` | 65% | No — ambiguous alone |

**Best Detection Fingerprint:** `integrations/claude/` + `integrations/codex/` + `companion/` + `app.py` = near-certain identification.

Confidence Score Model:
- 0-49: NOT DETECTED
- 50-79: AMBER_REVIEW (some signals, but ambiguous)
- 80-100: DETECTED (multiple unique signals)

---

## 2. Security Model (FACT)

### Network Binding
- Default: `APP_BIND=127.0.0.1` (loopback only)
- Services (chromadb, searxng, ntfy) also loopback-bound
- `0.0.0.0` binding requires explicit opt-in

### Docker Socket
- **NOT MOUNTED BY DEFAULT**
- Explicit opt-in via `docker/host-docker.yml` + `ODYSSEUS_ENABLE_HOST_DOCKER=true`
- Threat model: "Raw socket access is high-trust and can grant broad control over the host Docker daemon"

### Authentication
- bcrypt password hashing
- 7-day session tokens in `data/sessions.json`
- TOTP 2FA with 8 backup codes
- `LOCALHOST_BYPASS` — dev-only, must remain false for Docker/LAN/reverse proxy

### Roles
- ADMIN: full access (shell, filesystem, email, MCP, calendar, model serving, settings)
- NON-ADMIN: chat only (browser tool, documents, deep research, image generation, memory, skills)

### Tool Security
- `src/tool_security.py` enforces admin/non-admin boundaries
- Shell/Python execution: admin-only, no sandbox (acknowledged gap #1058)
- MCP tools: blocked for non-admins (all tools starting with `mcp__`)
- Prompt-injection hardening: untrusted content wrapped with security policy

### Known Gaps (FACT)
1. **No shell/filesystem sandbox** (#1058)
2. **SSRF via `/api/v1/chat` `base_url`** (PR #1039)
3. Incomplete search consolidation
4. Coarse token scopes

---

## 3. Integration Interfaces (FACT)

### Existing Integration Paths
1. **Claude Code Integration** (`integrations/claude/`): Skill bundle + API helper, `.zip` distribution via `/api/claude/plugin.zip`
2. **Codex Integration** (`integrations/codex/`): Plugin format + skill + scripts, `.zip` via `/api/codex/plugin.zip`

### Shared Auth: Scoped API tokens (Settings > Integrations), server-side scope enforcement

### NO GENERIC IMPORT API EXISTS
- No documented "import external rules" endpoint
- No policy import/export mechanism
- Integrations directory contains only `claude/` and `codex/`

### Skills Format
- Odysseus skills: JSON entries in `data/skills.json`
- **NOT compatible with `SKILL.md`** (YAML frontmatter + Markdown)
- Skills are user-editable text blocks treated as untrusted data

### Presets Format
- `data/presets.json` — agent configurations (model, system prompt, tools, temperature)
- Managed via `src/preset_manager.py`
- REST API: `routes/preset_routes.py`

---

## 4. License Boundary (FACT)

### AGPL-3.0-or-later
- Copyleft: any code that imports/incorporates Odysseus source must also be AGPL
- Our repository: MIT-licensed bootstrap kit — **cannot incorporate AGPL code**

### Safe Integration Boundary
- **External Adapter**: separate process, communicates via REST API
- **Data File Import/Export**: write to `data/presets.json`, `data/skills.json` as documented formats
- **No code linking**: adapter must not `import` Odysseus Python modules

### Decision: HANDOFF ONLY
Since no native import API exists and AGPL prevents code incorporation:
1. Generate portable handoff artifacts
2. User manually imports via Settings UI or copies files
3. Mark as `STRUCTURAL_PASS` (not live integration)
4. Classify as `TOOL_GAP_ODYSSEUS_RUNTIME` if live test needed

---

## 5. Odysseus-Specific Risks (for Gate Kernel)

| Risk | Severity | Gate |
|------|----------|------|
| `0.0.0.0` binding without auth | CRITICAL | RED_BLOCK |
| Docker socket mount without approval | CRITICAL | RED_BLOCK |
| Shell execution on host (no sandbox) | HIGH | Scope-gated Approval |
| Remote SSH write without approval | HIGH | Scope-gated Approval |
| Email send without approval | HIGH | Scope-gated Approval |
| Calendar write without approval | MEDIUM | Scope-gated Approval |
| Model download without approval | MEDIUM | Project-level Gate |
| Memory write without approval | MEDIUM | Approval Receipt |
| Skill write without approval | MEDIUM | Approval Receipt |
| MCP Tier 2 without human gate | HIGH | Kernel Gate |
| Public exposure without HTTPS + auth | CRITICAL | RED_BLOCK |
| GPU overlay without separate approval | MEDIUM | Approval Receipt |
| AGPL code incorporation | CRITICAL | Kernel Gate (NO_AGPL_INCORPORATION) |

---

## 6. Handoff Strategy

### Portable Handoff Artifacts
```
integrations/odysseus/
├── README.md              # Import instructions
├── system-prompt.md        # Gate policy as system prompt text
├── gate-policy.json        # Machine-readable gate definitions
├── tool-policy.json        # Tool restrictions for Odysseus
├── approval-model.json     # Approval receipt schema
├── runtime-profile.json    # Odysseus capability mapping
└── manual-import.md        # Step-by-step import guide
```

Optional target-project artefacts:
```
.agent-governance/odysseus/
```

### Properties
- **NICHT** automatisch von Odysseus geladen
- Manuell als Preset/System Prompt zu importieren
- Strukturell validierbar durch unseren Validator
- Nicht als Live-Integration ausgeben
- Kein AGPL-Code enthalten

---

## Entscheidungszusammenfassung

### Gelesen
- Odysseus Repository: README.md, SECURITY.md, THREAT_MODEL.md, CONTRIBUTING.md, ROADMAP.md
- docker-compose.yml, Dockerfile, .env.example, pyproject.toml
- src/constants.py, src/tool_security.py, core/auth.py, core/middleware.py
- integrations/claude/README.md, integrations/codex/README.md
- companion/README.md

### Validierte Fakten
1. AGPL-3.0-or-later → keine Codeübernahme erlaubt
2. Keine native Import-Schnittstelle für externe Agentenregeln
3. Docker-Socket standardmäßig NICHT gemountet
4. Alle Services binden standardmäßig auf Loopback
5. Shell-Execution hat keinen Sandbox
6. Integration-System ist purpose-built für Claude Code und Codex

### Entscheidung
- Handoff-only Ansatz: portable Artefakte, keine native Integration
- Keine AGPL-Codeübernahme
- Multi-Signal Detection mit Confidence Score
- `STRUCTURAL_PASS` für strukturelle Validierung
- `TOOL_GAP_ODYSSEUS_RUNTIME` für Live-Test-Lücke
