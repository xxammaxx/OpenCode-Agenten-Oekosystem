# OpenCode Agenten-Ökosystem

**Produktionsreifes Agenten-Ökosystem für Spec-Driven Development, Security Research und DSGVO-konforme Civic-Tech-Software**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OpenCode](https://img.shields.io/badge/OpenCode-Compatible-brightgreen)](https://opencode.ai)

---

## Übersicht

Dieses Repository enthält ein vollständig konfiguriertes OpenCode-Agenten-Ökosystem mit:

- **9 spezialisierten Agenten** (Orchestrator, Review, Security, Compliance, Migration, Playwright, Architecture, Research, Documentation)
- **11 Skills** für deterministische, evidenzbasierte Workflows
- **MCP Trust-Tier-Sicherheitsmodell** (Readonly → Sandboxed → Trusted)
- **Spec-Driven Development** (Speckit-Workflow)
- **DSGVO-Compliance** für Tierheim-Verwaltungssoftware
- **GitHub als Single Source of Truth**
- **Evidence-Gated Progression** — Halluzinationsschutz
- **GitHub Actions CI/CD** für Security-Review, Visual-QA und Audits

---

## Architekturprinzipien

```
┌──────────────────────────────────────────────┐
│ 1. Evidence-Gated Progression                │
│    Kein Claim ohne Evidenz (PoC, Test, Log)  │
├──────────────────────────────────────────────┤
│ 2. GitHub als Single Source of Truth         │
│    Jede Arbeitseinheit = GitHub Issue        │
├──────────────────────────────────────────────┤
│ 3. Spec-Driven Development                   │
│    Kein Code ohne Spezifikation              │
├──────────────────────────────────────────────┤
│ 4. MCP Security (Trust-Tiers)                │
│    Readonly-Default, Sandboxing, Audit       │
├──────────────────────────────────────────────┤
│ 5. Agent Isolation & Governance              │
│    Jeder Agent hat minimale Rechte           │
├──────────────────────────────────────────────┤
│ 6. Audit-Trail für jede AI-Entscheidung      │
│    Immutable Logs, DSGVO-konform             │
└──────────────────────────────────────────────┘
```

---

## Schnellstart

### Voraussetzungen

- [OpenCode](https://opencode.ai) installiert (`npm install -g opencode-ai`)
- [GitHub CLI](https://cli.github.com) (`gh`) installiert und authentifiziert
- Git installiert
- Node.js 20+ (für Playwright und Tool-Support)
- `node scripts/install-global.mjs` zum Spiegeln der OpenCode-Konfiguration auf einen zweiten Rechner

### Installation — Global (empfohlen)

OpenCode lädt die globale Konfiguration aus `~/.config/opencode/opencode.json` und globale Agents/Skills aus `~/.config/opencode/{agents,skills}`. Das Installationsskript spiegelt das Repository dorthin und legt vorher ein Backup der bestehenden Konfiguration an.

Empfohlener Ablauf für einen zweiten Rechner oder eine andere KI:

```bash
git clone https://github.com/xxammaxx/OpenCode-Agenten-Oekosystem.git
cd OpenCode-Agenten-Oekosystem
node scripts/install-global.mjs
```

Falls du die Schritte manuell spiegeln willst, nutze die PowerShell- oder Bash-Blöcke darunter.

Manuelle Fallback-Befehle:

```powershell
# PowerShell (Windows)
$repoUrl = "https://github.com/xxammaxx/OpenCode-Agenten-Oekosystem.git"
$globalOpenCode = "$env:USERPROFILE\.config\opencode"
$tmpDir = "$env:TEMP\opencode-ecosystem"

# Klonen
git clone $repoUrl $tmpDir

# OpenCode-Assets spiegeln
Copy-Item -Path "$tmpDir\.opencode" -Destination "$globalOpenCode\.opencode" -Recurse -Force

# Agents installieren
New-Item -ItemType Directory -Path "$globalOpenCode\agents" -Force
New-Item -ItemType Directory -Path "$globalOpenCode\skills" -Force
Copy-Item -Path "$tmpDir\.opencode\agents\*" -Destination "$globalOpenCode\agents\" -Recurse -Force
Copy-Item -Path "$tmpDir\.opencode\skills\*" -Destination "$globalOpenCode\skills\" -Recurse -Force

# AGENTS.md, CONTRIBUTING.md und SECURITY.md global installieren
if (-not (Test-Path "$globalOpenCode\AGENTS.md")) {
    Copy-Item -Path "$tmpDir\AGENTS.md" -Destination "$globalOpenCode\AGENTS.md"
} else {
    Write-Warning "Global AGENTS.md exists — merge manually: $globalOpenCode\AGENTS.md"
}
if (-not (Test-Path "$globalOpenCode\CONTRIBUTING.md")) {
    Copy-Item -Path "$tmpDir\CONTRIBUTING.md" -Destination "$globalOpenCode\CONTRIBUTING.md"
} else {
    Write-Warning "Global CONTRIBUTING.md exists — merge manually: $globalOpenCode\CONTRIBUTING.md"
}
if (-not (Test-Path "$globalOpenCode\SECURITY.md")) {
    Copy-Item -Path "$tmpDir\SECURITY.md" -Destination "$globalOpenCode\SECURITY.md"
} else {
    Write-Warning "Global SECURITY.md exists — merge manually: $globalOpenCode\SECURITY.md"
}

# Globale opencode.json installieren
if (-not (Test-Path "$globalOpenCode\opencode.json")) {
    Copy-Item -Path "$tmpDir\opencode.jsonc" -Destination "$globalOpenCode\opencode.json"
} else {
    Write-Warning "Global opencode.json exists — merge repo settings into $globalOpenCode\opencode.json"
}

# Aufräumen
Remove-Item -Recurse -Force $tmpDir
Write-Output "OpenCode Agenten-Ökosystem global installiert."
```

```bash
# Bash (Linux/macOS/WSL)
REPO_URL="https://github.com/xxammaxx/OpenCode-Agenten-Oekosystem.git"
GLOBAL_OC="$HOME/.config/opencode"
TMP_DIR=$(mktemp -d)

git clone "$REPO_URL" "$TMP_DIR"

# OpenCode-Assets spiegeln
cp -R "$TMP_DIR/.opencode" "$GLOBAL_OC/.opencode"

# Agents und Skills installieren
mkdir -p "$GLOBAL_OC/agents" "$GLOBAL_OC/skills"
cp -r "$TMP_DIR/.opencode/agents/"* "$GLOBAL_OC/agents/"
cp -r "$TMP_DIR/.opencode/skills/"* "$GLOBAL_OC/skills/"

# AGENTS.md, CONTRIBUTING.md und SECURITY.md global installieren
if [ ! -f "$GLOBAL_OC/AGENTS.md" ]; then
    cp "$TMP_DIR/AGENTS.md" "$GLOBAL_OC/AGENTS.md"
else
    echo "WARNING: Global AGENTS.md exists — merge manually: $GLOBAL_OC/AGENTS.md"
fi
if [ ! -f "$GLOBAL_OC/CONTRIBUTING.md" ]; then
    cp "$TMP_DIR/CONTRIBUTING.md" "$GLOBAL_OC/CONTRIBUTING.md"
else
    echo "WARNING: Global CONTRIBUTING.md exists — merge manually: $GLOBAL_OC/CONTRIBUTING.md"
fi
if [ ! -f "$GLOBAL_OC/SECURITY.md" ]; then
    cp "$TMP_DIR/SECURITY.md" "$GLOBAL_OC/SECURITY.md"
else
    echo "WARNING: Global SECURITY.md exists — merge manually: $GLOBAL_OC/SECURITY.md"
fi

# Globale opencode.json installieren
if [ ! -f "$GLOBAL_OC/opencode.json" ]; then
    cp "$TMP_DIR/opencode.jsonc" "$GLOBAL_OC/opencode.json"
else
    echo "WARNING: Global opencode.json exists — merge repo settings into $GLOBAL_OC/opencode.json"
fi

rm -rf "$TMP_DIR"
echo "OpenCode Agenten-Ökosystem global installiert."
```

### Installation — Pro Projekt

Kopiere das `.opencode/`-Verzeichnis und die Konfigurationsdateien in dein Projekt:

```bash
git clone https://github.com/xxammaxx/OpenCode-Agenten-Oekosystem.git
cd OpenCode-Agenten-Oekosystem

# In dein Projekt kopieren:
cp -r .opencode/ /pfad/zu/deinem/projekt/
cp AGENTS.md CONTRIBUTING.md opencode.jsonc SECURITY.md /pfad/zu/deinem/projekt/
cp -r .github/workflows/ /pfad/zu/deinem/projekt/.github/
```

### Konfiguration

1. **GitHub CLI authentifizieren:**
   ```bash
   gh auth login
   ```

2. **API-Keys setzen (für Cloud-Modelle):**
   ```bash
   export ANTHROPIC_API_KEY="sk-ant-..."
   # Optional:
   export BRAVE_API_KEY="BSA..."
   export OPENAI_API_KEY="sk-..."
   ```

3. **OpenCode starten:**
   ```bash
   cd /pfad/zu/deinem/projekt
   opencode
   ```

4. **Agent wechseln:** Drücke `Tab` um zwischen `issue-orchestrator`, `plan`, und `build` zu wechseln.

Nach Änderungen an `opencode.json` oder an Dateien unter `.opencode/` OpenCode neu starten, damit die Konfiguration neu geladen wird.

---

## Agent-Übersicht

| Agent | Typ | Zugriff | Aufgabe |
|-------|-----|---------|---------|
| `issue-orchestrator` | Primary | GitHub Issues, Koordination | Orchestriert Workflows, delegiert an Subagents |
| `plan` | Primary | Readonly | Analysiert Code, plant ohne Änderungen |
| `build` | Primary | Write (mit Gates) | Implementiert Code |
| `review-agent` | Sub | Readonly | Code-Qualität und Security-Review |
| `research-agent` | Sub | Readonly + Web | Externe Recherche, CVE-Lookups |
| `compliance-agent` | Sub | Readonly | DSGVO-Audit, Datenminimierung |
| `migration-agent` | Sub | Write (limitiert) | DB-Migrationen prüfen |
| `playwright-agent` | Sub | Write (Screenshots) | Visuelle Regression |
| `architecture-agent` | Sub | Readonly | ADR-Erstellung |
| `security-agent` | Sub | Write (Test-Env) | PoC-Reproduktion, CVSS |
| `documentation-agent` | Sub | Write (docs/) | Dokumentation, Changelog |

---

## Skill-Übersicht

| Skill | Aktivierung durch |
|-------|-------------------|
| `github-source-of-truth` | Immer bei Task-Start |
| `read-before-sketch` | Architektur, APIs, SDKs, MCP, Security, neue Abhängigkeiten |
| `spec-driven-development` | Feature-Request, "Spec" |
| `security-evidence-gate` | "Vulnerability", "CVE" |
| `playwright-visual-review` | Frontend-Änderung |
| `migration-review` | SQL-Migration erkannt |
| `tierheim-compliance` | Code in Tierheim-Pfaden |
| `funding-document-generator` | "Förderantrag" |
| `architecture-review` | "Architektur", neue Dependency |
| `test-enforcement` | Vor jedem Commit |
| `audit-trail-enforcer` | Immer (global) |

---

## Workflows

Der Speckit-Workflow wird strikt eingehalten:

```
/speckit.constitution → /speckit.specify → /speckit.plan
→ /speckit.tasks → /speckit.taskstoissues → /speckit.implement
```

Kein Code ohne abgeschlossene Spezifikation.

---

## MCP-Sicherheitsmodell

Alle MCP-Server sind **standardmäßig deaktiviert**. Sie werden pro Agent mit minimalen Rechten aktiviert:

| Tier | MCPs | Rechte |
|------|------|--------|
| **Tier 0** (Readonly) | GitHub, Brave Search, Context7 | Nur Lesezugriff |
| **Tier 1** (Sandboxed) | Playwright, Docker, SQLite | Sandboxed Write |
| **Tier 2** (Trusted) | FileSystem, PostgreSQL | Human-Gate erforderlich |

---

## GitHub Actions

| Workflow | Trigger | Agent |
|----------|---------|-------|
| `opencode-spec-driven.yml` | Issue mit Label `spec-driven` | issue-orchestrator |
| `opencode-security-review.yml` | PR mit Security-relevanten Änderungen | security-agent |
| `opencode-visual-qa.yml` | PR mit Frontend-Änderungen | playwright-agent |
| `opencode-weekly-audit.yml` | Jeden Montag 08:00 UTC | compliance-agent |

---

## Evidence-Gated Progression

Bevor ein Agent Behauptungen aufstellen darf, MUSS Evidenz vorliegen:

| Claim-Typ | Benötigte Evidenz |
|-----------|-------------------|
| Security Severity | PoC + Logs + CVSS-Vektor + Screenshot |
| Architecture Decision | ADR + Dependency-Analyse + Alternativen |
| Migration Ready | Rollback-Test + Data-Integrity-Check |
| Bug Fixed | Test vorher/nachher + Regressionstest |
| Feature Complete | Acceptance-Kriterien + Coverage |
| DSGVO-Compliant | Data-Flow-Diagramm + Consent + Retention |

---

## DSGVO-Compliance (CiviPet OS)

- **AI darf NIEMALS kanonische Daten autonom verändern**
- Alle Schreiboperationen auf Produktionsdaten erfordern Human-Gate
- Retention: 10 Jahre (Vet-Records), 3 Jahre (Adoption), 1 Jahr (Inquiries)
- Audit-Trail für jede AI-Entscheidung, aufbewahrt für 10 Jahre
- Datenminimierung: Jedes PII-Feld muss dokumentierten Zweck haben

---

## Performance (GTX 1070 / 8GB)

- Lazy-Loading von Skills (nur laden wenn Kontext-Trigger matched)
- Subagent-Delegation für komplexe Analysen
- Lokale Modelle: `ollama/gemma3:12b` (leichte Tasks), `ollama/qwen2.5:14b` (schwere Tasks)
- Max 2 parallele Subagents
- Kontext-Budgetierung pro Agent (8000-32000 Tokens je nach Aufgabe)

---

## Verzeichnisstruktur

```
.
├── AGENTS.md                        # Projektregeln
├── CONTRIBUTING.md                  # Mitwirkungs- und Installationshinweise
├── SECURITY.md                      # Security Policy
├── opencode.jsonc                   # Hauptkonfiguration (global gespiegelt als ~/.config/opencode/opencode.json)
├── scripts/
│   └── install-global.mjs           # Ein-Klick-Installer für andere Rechner/KIs
├── .gitignore
├── .github/workflows/               # GitHub Actions
│   ├── opencode-spec-driven.yml
│   ├── opencode-security-review.yml
│   ├── opencode-visual-qa.yml
│   └── opencode-weekly-audit.yml
└── .opencode/
    ├── agents/                      # Agent-Definitionen
    │   ├── issue-orchestrator.md
    │   ├── review-agent.md
    │   ├── research-agent.md
    │   ├── compliance-agent.md
    │   ├── migration-agent.md
    │   ├── playwright-agent.md
    │   ├── architecture-agent.md
    │   ├── security-agent.md
    │   └── documentation-agent.md
    ├── skills/                      # Skill-Definitionen
    │   ├── github-source-of-truth/SKILL.md
    │   ├── read-before-sketch/SKILL.md
    │   ├── spec-driven-development/SKILL.md
    │   ├── security-evidence-gate/SKILL.md
    │   ├── playwright-visual-review/SKILL.md
    │   ├── migration-review/SKILL.md
    │   ├── tierheim-compliance/SKILL.md
    │   ├── funding-document-generator/SKILL.md
    │   ├── architecture-review/SKILL.md
    │   ├── test-enforcement/SKILL.md
    │   └── audit-trail-enforcer/SKILL.md
    ├── prompts/                     # Prompt-Templates
    ├── policies/                    # Richtlinien (JSON)
    │   ├── evidence-gates.json
    │   ├── mcp-trust-tiers.json
    │   ├── write-protection.json
    │   ├── data-retention.json
    │   └── model-routing.json
    ├── templates/                   # Vorlagen
    ├── workflows/                   # Workflow-YAMLs
    ├── hooks/                       # Git-Hooks
    ├── memory/                      # Agent-Gedächtnis
    ├── validation/                  # Schema-Validatoren
    ├── logs/                        # Session/Audit-Logs
    └── reports/                     # Generierte Berichte
```

---

## Lizenz

MIT — Siehe [LICENSE](LICENSE)

---

## Mitwirken

Issues und Pull Requests sind willkommen. Bitte folge dem Spec-Driven-Workflow und poste strukturierte Start-/End-Kommentare.

---

*Entwickelt für CiviPet OS, Positron, MietVisor und allgemeine Civic-Tech-Projekte.*
