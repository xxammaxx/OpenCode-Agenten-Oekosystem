# Canonical Working Method — Run Report

## Abschlussklassifikation
**GREEN_SAFE**

## Ausgangscommit
`045dc274088ad8dd3132302d9d5e5a0fadd458e5` (PR #1 Squash-Merge)

## GitHub
- **Issue**: [#2](https://github.com/xxammaxx/OpenCode-Agenten-Oekosystem/issues/2)
- **Branch**: `agent/canonical-working-method`
- **Status**: Ready for Draft-PR

## Geänderte Dateien
- 21 modifizierte Dateien
- 14 neue Dateien/Verzeichnisse
- **Gesamt:** 35 Änderungen

### Neue Workflow-Komponenten
| Kategorie | Datei | Beschreibung |
|-----------|-------|--------------|
| Kanonischer Vertrag | `WORKING-METHOD.md` | 1135 Zeilen, 24-Schritt-Workflow |
| Policy | `.opencode/policies/working-method.json` | 315 Zeilen, maschinenlesbar |
| Skill | `.opencode/skills/context-engineering/SKILL.md` | COLD/WARM/HOT-Modul |
| Skill | `.opencode/skills/risk-tier-routing/SKILL.md` | Dynamische Risikobewertung |
| Skill | `.opencode/skills/verification-contract/SKILL.md` | Vertragsmodul |
| Skill | `.opencode/skills/owner-approval-gate/SKILL.md` | 9-Gate-Approval |
| Skill | `.opencode/skills/anti-fake-execution/SKILL.md` | Fake-Execution-Schutz |
| Skill | `.opencode/skills/privacy-data-minimization/SKILL.md` | Generischer Datenschutz |
| Architektur | `docs/architecture/canonical-working-method.md` | ADR |
| Architektur | `docs/architecture/canonical-working-method.mmd` | Mermaid-Diagramm |
| Hermes | `.hermes/skill-bundles/canonical-working-method.yaml` | Natives YAML-Bundle |
| Hermes | `.hermes/config.example.yaml` | Konfigurationsbeispiel |
| Report | `docs/reports/working-method-deep-dive-2026-07-15.md` | Deep-Dive-Analyse |
| Test | `test/validation/working-method.test.mjs` | 68 neue Test-Assertions |

### Aktualisierte Komponenten
| Datei | Änderung |
|-------|----------|
| `AGENTS.md` | Canonical Working Method, Security-before-Compliance, risikobasiertes Speckit |
| `opencode.jsonc` | Deprecated `tools` entfernt, neue Skills, Instructions aktualisiert |
| `ecosystem.manifest.json` | Domain-Entkopplung, neue Skills/Sektionen |
| `scripts/lib/manifest.mjs` | PII-Detection-Split, neue Core-Skills |
| `scripts/lib/merge.mjs` | `lastIndexOf`-Fix für verschachtelte Sektionen |
| `scripts/validate-ecosystem.mjs` | 20 neue Validierungen |
| `.opencode/policies/write-protection.json` | Human-Gate/Managed-Files-Struktur |
| `.opencode/policies/evidence-gates.json` | 4 neue Gates + Structural-vs-Live |
| `.opencode/skills/audit-trail-enforcer/SKILL.md` | Retention minimiert |
| `.opencode/skills/*/SKILL.md` | 7 bestehende Skills aktualisiert |
| `.hermes.md`, `.hermes/README.md` | YAML-Bundle-Referenz |
| `BOOTSTRAP.md`, `README.md` | Canonical-Working-Method-Layer |

## Context Levels
- **COLD**: Auftrag + Constraints (keine Implementierung)
- **WARM**: Validierte Fakten + Architektur (nur Planung)
- **HOT**: Runtime-Evidence + Approval (Implementierung)

## Risk Tiers
- **LOW_LOCAL**: Lightweight Spec, lokale Tests
- **MEDIUM_REVIEW**: Spec + Plan + Tasks, Security/Compliance-Screening
- **HIGH_HUMAN_GATE**: Full Speckit, Owner Approval, Security + Compliance
- **CRITICAL_BLOCK**: Keine Implementierung

## Truth Layers
0. Reality Truth (höchste Priorität)
1. Executable Truth
2. Evidence Truth
3. Documentation Truth
4. Memory/Chat Context (niemals höhere Layer überschreiben)

## Approval Gates (9)
Apply, Commit, Push, PR, Merge, Deploy, Remote CI, Skill Write, Memory Write

## Verification Contract
Desired Behavior, Acceptance Criteria, Red Tests, Regression Tests, Reality Gate, Evidence Types, Untestable Assumptions — Pflicht für alle Risk Tiers

## Red Tests
Soweit technisch möglich. Ausnahmen: strukturelle Änderungen, fehlende Testinfrastruktur, unverhältnismäßiger Aufwand

## Anti-Fake Execution
8 Verbote + 5 Pflichten, strukturelle vs. Live-Verifikation, TOOL_GAP-Klassifizierung

## OpenCode-Änderungen
- Deprecated `tools`-Key entfernt (Top-Level + alle Agenten)
- `WORKING-METHOD.md` + `working-method.json` in Instructions
- `data-retention.json` aus globalen Instructions entfernt
- 6 neue Skills für issue-orchestrator freigegeben
- Keine Provider-/Modellvorgabe, MCPs deaktiviert

## Hermes-Änderungen
- Natives YAML-Bundle: `.hermes/skill-bundles/canonical-working-method.yaml`
- Config-Example mit `write_approval: true` für Skills und Memory
- JSON-Bundle als internes Bootstrap-Manifest gekennzeichnet
- `TOOL_GAP_HERMES_RUNTIME` dokumentiert

## Regressionstest PR #1
Alle 26 bestehenden Tests bestehen weiterhin:
1. ✅ Overlay-Apply-Import
2. ✅ Rollback-Argumentvalidierung
3. ✅ RED_BLOCK-Vorrang
4. ✅ Symlink-Lstat-Prüfung
5. ✅ Root-/Sudo-Guard
6. ✅ Restore-Zielprüfung
7. ✅ Merge-Status-Kennzeichnung
8. ✅ Hermes-Skill-Duplikat
9. ✅ Monorepo-node_modules
10. ✅ Test-Ignore-Logik

## Reality Gate
Abgedeckt durch Test "discovery covers all fixture shapes" (12 Fixtures), alle bestehen.

## Security Review
- Security vor Compliance in Agentenreihenfolge
- Deprecated `tools` entfernt → nur `permission`-basierte Zugriffskontrolle
- Private Remote-CI ohne Approval = RED_BLOCK
- Anti-Fake-Execution verhindert halluzinierte Security Claims

## Compliance Review
- Privacy-Data-Minimization als generischer Skill (nicht domain-spezifisch)
- Data-Retention nur bei Tierheim-Signalen (nicht global)
- Audit-Retention minimiert (keine pauschale 10-Jahres-Frist)
- Tierheim-Compliance bleibt konditional

## Reviewer-Ergebnis
**PASS** — Alle 21 Prüfkriterien erfüllt, keine Findings.

## Bekannte Grenzen
- `TOOL_GAP_HERMES_RUNTIME`: Kein Live-Test der Hermes-Runtime möglich
- Speckit-Integration ist Ecosystem-Konvention, kein OpenCode-Feature
- Trust Tiers sind Ecosystem-Konvention, kein OpenCode-Feature
- Hermes-YAML-Bundles sind Projektformat, nicht Hermes-native

## Exakte Test-Evidence
```
Validator: GREEN_SAFE
Tests: 94/94 bestanden (26 bestehend + 68 neu)
37 Suites, 0 Failures
```

## Repository implementation status
✅ Abgeschlossen — 35 Dateien geändert/neu

## OpenCode structural verification
✅ Alle Syntax-Checks bestanden, kein deprecated `tools`, Permission-Modell aktuell

## OpenCode runtime verification
⚠️ Strukturell verifiziert, kein Live-OpenCode-Prozess verfügbar

## Hermes structural verification
✅ YAML-Bundle valide, Config-Example mit Write-Approvals

## Hermes runtime verification
⚠️ TOOL_GAP_HERMES_RUNTIME — Strukturell verifiziert, kein Live-Test

## MCP live verification
⚠️ Keine konfigurierten MCP-Server für Live-Test verfügbar

## GitHub publication status
🔄 Bereit für Draft-PR
