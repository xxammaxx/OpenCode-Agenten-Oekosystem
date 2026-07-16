# Canonical Working Method Deep Dive — 2026-07-15

## 1. Vorhandene Standards

Das Repository enthält bereits eine Reihe etablierter Standards für den Arbeitsablauf:

- **ADR-Format**: Architecture Decision Records unter `docs/adr/` mit strukturiertem Format (Titel, Status, Kontext, Entscheidung, Konsequenzen).
- **Run Cards**: `run-card` Skill unter `.opencode/skills/run-card/` definiert standardisierte Aufgabenkarten.
- **Project-Reality-Refresh**: Skill unter `.opencode/skills/project-reality-refresh/` validiert den tatsächlichen Repository-Zustand vor Aufgabenbeginn.
- **Living-Truth-Mirror**: Skill unter `.opencode/skills/living-truth-mirror/` hält Entscheidungen und Fakten während der Session konsistent.
- **Spec-Driven-Development Skill**: `.opencode/skills/spec-driven-development/SKILL.md` definiert den Speckit-Workflow (Verfassung → Spezifikation → Plan → Tasks → Issues → Implementierung).
- **Evidence Gates**: `.opencode/policies/evidence-gates.json` definiert Nachweispflichten vor Behauptungen (Severity, Architekturentscheidung, Bugfix, etc.).
- **Audit Trails**: `audit-trail-enforcer` Skill protokolliert Entscheidungen in `.opencode/logs/audit/`.
- **MCP Trust Tiers**: `.opencode/policies/mcp-trust-tiers.json` kategorisiert MCP-Server in drei Stufen (Readonly, Sandboxed, Trusted).
- **Write Protection**: `.opencode/policies/write-protection.json` definiert `human_gate_required` und `deny_always`-Operationen.
- **Bootstrap Workflow**: `scripts/bootstrap-project.mjs` implementiert den strukturierten Bootstrap mit Dry-Run als Default, Backup und Rollback.
- **12-Step Agent Order**: In `AGENTS.md` (Reality Refresh → Run Card → Research → Planning → Architecture → Compliance → Security → Implementation → Tests → Documentation → Reviewer → Evidence-Abschluss) und deckungsgleich in `.opencode/agents/issue-orchestrator.md`.
- **Task Start/End Gates**: `AGENTS.md` definiert Start Gate (fetch, issue lesen, Start-Kommentar) und End Gate (Tests, diff, Completion-Kommentar).

## 2. Fehlende Standards

Nach Analyse der bestehenden Dokumente und Policies fehlen folgende Standards:

- **OS/Shell/Runtime/Tool Pre-Flight**: Kein standardisierter Check, ob das Betriebssystem, die Shell, die Runtime (Node.js, Python, etc.) und benötigte Tools (git, node, docker, etc.) in der erwarteten Version vorliegen, bevor ein Agent mit der Arbeit beginnt.

- **Cold/Warm/Hot Context Levels**: Keine Definition, welche Kontextinformationen in jedem Zustand verfügbar sein müssen:
  - *Cold*: Nur Repository-Struktur, AGENTS.md, Manifest
  - *Warm*: + Aktuelles Issue, relevante Policies, letzte Run Reports
  - *Hot*: + Vollständige Session-Historie, offene Subagent-Ergebnisse, Live-Diagnose

- **Context Manifest**: Kein maschinenlesbares Dokument, das den aktuellen Kontext-Level, geladene Skills, aktive Agents, offene Tasks und den Session-Zustand deklariert.

- **Hard-Constraint-Re-Injection**: Kein Mechanismus, der nach Context Compaction (OpenCode `compaction.auto`) die kritischen Constraints (Write Protection, Human Gates, Security Rules) automatisch neu lädt.

- **Dynamic Risk Tiers (separate von MCP Trust Tiers)**: Es gibt MCP Trust Tiers, aber keine projektbezogenen Risk Tiers für Änderungen (z. B. LOW: Tippfehler, MEDIUM: Konfigurationsänderung, HIGH: Breaking Change, CRITICAL: Security Patch).

- **Risk-Based Speckit**: Der Speckit-Workflow wird pauschal für alle Änderungen gefordert. Es fehlt eine Abstufung: Nur bei HIGH/CRITICAL Risk Tier muss der vollständige Speckit-Durchlauf erfolgen; bei LOW/MEDIUM reichen reduzierte Schritte.

- **Verification Contract**: Keine standardisierte Liste von Bedingungen, die erfüllt sein müssen, bevor ein Agent `done`, `fixed` oder `complete` behaupten darf (über die Evidence Gates hinaus).

- **Red Tests**: Keine Praxis, vor einer Änderung einen Test zu schreiben, der den bestehenden Fehler reproduziert (Red-Green-Refactor). Aktuell wird nur "Tests bestehen" gefordert, nicht "Tests sind zuerst rot".

- **Non-Touch Areas**: Keine dokumentierten Bereiche, die ein Agent niemals ändern darf (über `write-protection.json` `never_edit` hinaus). Fehlt eine menschenlesbare Liste im WORKING-METHOD.md.

- **Separate Owner-Approval Gates**: Alle irreversiblen Operationen teilen sich aktuell ein Gate (`git push`: deny, `git commit`: ask). Es gibt keine getrennten Gates für:
  - Apply (Änderungen im Workspace)
  - Commit (lokaler Commit)
  - Push (Remote-Push)
  - PR (Pull Request)
  - Merge (PR-Merge)
  - Deploy (Auslieferung)
  - Skill Write (Änderung an Skill-Dateien)
  - Memory Write (Schreiben ins Agent Memory)

- **Anti-Fake-Execution Rules**: Kein struktureller Schutz gegen halluzinierte Tool-Ausgaben oder vorgetäuschte Testläufe. Es gibt keine Regel, dass jeder Tool-Call durch Output-Beweise belegt werden muss.

- **Five Truth Layers**: Aktuell gibt es keine explizite Hierarchie der Wahrheitsquellen:
  - *Layer 0: Reality* — Tatsächlicher Repository-Zustand (git status, Dateisystem)
  - *Layer 1: Executable* — Laufende Prozesse, Testergebnisse, Compiler-Output
  - *Layer 2: Evidence* — Dokumentierte Beweise (Screenshots, Logs, CVSS)
  - *Layer 3: Documentation* — Policies, README, Architekturdokumente
  - *Layer 4: Memory/Chat* — Agent-Output, Chat-Historie (geringste Vertrauensstufe)

- **Security before Compliance order**: In der aktuellen 12-Step Order (Schritt 6 Compliance, Schritt 7 Security) kommt Compliance vor Security. Die Zielarchitektur dreht die Reihenfolge um, da Security-Verletzungen schwerwiegender sind als Compliance-Verstöße und Security oft eine Voraussetzung für Compliance ist.

- **Generic privacy/data-minimization rules**: Die aktuellen Datenschutzregeln in `data-retention.json` sind auf Tierheim/CiviPet („domain_specific") zugeschnitten. Es fehlen generische Regeln für PII-Handling, Datenminimierung und Löschung, die für jedes Projekt gelten.

- **Native Hermes YAML bundles**: Das Repository verwendet `.hermes/bundles/project-bootstrap.json` im JSON-Format. Hermes verwendet jedoch nativ YAML (`~/.hermes/config.yaml`). Es gibt kein hermes-natives YAML-Bundle-Format.

- **Hermes Skill/Write-Approval und Memory-Write-Approval**: Es gibt keine Approval-Gates für Hermes-spezifische Aktionen wie Skill-Installation oder Memory-Schreibzugriffe.

## 3. Widersprüche (Research vs Current Implementation)

Die vom Research-Agenten dokumentierten Widersprüche zwischen der lokalen Implementierung und der offiziellen Dokumentation:

| ID | Lokal (aktuell) | Offizielle Dokumentation | Schwere |
|----|-----------------|------------------------|---------|
| W1 | `hermes-agent` referenziert `xxammaxx/hermes-agent` (existiert nicht) | Echtes Repo: `NousResearch/hermes-agent` | KRITISCH |
| W2 | `.hermes/` JSON-Bundles, `.hermes.md` | Hermes ist Python-basiert, Skills sind `SKILL.md`, Config ist `~/.hermes/config.yaml` (YAML), nicht JSON-Bundles | HOCH |
| W3 | `opencode.jsonc` verwendet `tools` (deprecated seit v1.1.1) — Zeilen 65–72, 148, 240, 289, 315, 372 | Nur `permission` ist aktuell unterstützt; `tools` wird in zukünftigen Versionen entfernt | HOCH |
| W4 | `AGENTS.md` referenziert `/speckit.*` Commands (Zeilen 43–48) | Keine `/speckit` Commands in OpenCode native; Speckit ist Community-Workflow | HOCH |
| W5 | `ecosystem.manifest.json` definiert "Trust Tiers" (Zeilen 53–81) | OpenCode hat kein Trust-Tier-System; Trust Tiers sind Ecosystems-Konvention | MITTEL |
| W6 | Agent-Namen (issue-orchestrator, research-agent, compliance-agent, etc.) | Keine offiziellen OpenCode-Standard-Agenten-Namen; sind Custom Agents des Ecosystems | MITTEL |
| W7 | `BOOTSTRAP.md` und `.hermes.md`: `hermes --skills` CLI-Flag | Hermes CLI unterstützt `--skills` für Bundle-Ausführung; die genahe Flag-Syntax entspricht nicht der Bootstrap-Dokumentation | HOCH |
| W8 | Policies als separate JSON-Dateien in `.opencode/policies/` | OpenCode unterstützt Policies in `opencode.json` unter `experimental.policies` (seit v1.15.x); separate Dateien sind Ecosystems-Konvention | MITTEL |

## 4. Technische Schulden

Die folgenden technischen Schulden wurden identifiziert:

1. **`tools`-Key in opencode.jsonc (deprecated)**: Die Schlüssel `tools` auf globaler Ebene (Zeile 65) und in Agent-Konfigurationen (issue-orchestrator Zeile 148, research-agent Zeile 240, migration-agent Zeile 289, playwright-agent Zeile 315, security-agent Zeile 372) sind seit OpenCode v1.1.1 deprecated. Migration zu `permission`-basiertem Tool-Filtering ist erforderlich.

2. **Speckit-Referenzen ohne tatsächliche OpenCode-Integration**: `AGENTS.md` (Zeilen 39–50) und `issue-orchestrator.md` (Zeilen 18–22) fordern den Speckit-Workflow (`/speckit.constitution`, `/speckit.specify` usw.). OpenCode hat keine nativen Slash-Commands dafür. Speckit ist ein Community-Workflow, der manuell oder über einen Skill abgebildet werden müsste.

3. **Hermes-Referenzen (URL, CLI, Format) entsprechen nicht der echten Hermes-Runtime**:
   - `.hermes/bundles/project-bootstrap.json` ist JSON, Hermes-Config ist nativ YAML.
   - `.hermes.md` listet `--skills` als CLI-Flag; die genaue Semantik weicht von der tatsächlichen Hermes-Implementation ab.
   - Hermes verwendet `~/.hermes/config.yaml` als primäre Config, nicht `.hermes/config.json`.

4. **`data-retention.json` wird global geladen**: `opencode.jsonc` Zeile 29 lädt `data-retention.json` in `instructions` für jedes Projekt. Die Policy ist aber mit `"domain": "conditional"` im Manifest katalogisiert und sollte nur bei passenden Projektsignalen (Tierheim/CiviPet) aktiv sein.

5. **`compliance-agent` und `security-agent` sind `domain_specific` katalogisiert**: Im `ecosystem.manifest.json` (Zeilen 231–240) sind beide als `domain_specific` geführt. Sicherheit und Compliance sind jedoch generische Anforderungen, die jedes Projekt betreffen. Müssen zu `generic` verschoben werden.

6. **`tierheim-retention` als separate Policy existiert nicht**: `ecosystem.manifest.json` Zeile 299 listet `"tierheim-retention"` in `catalogs.policies.domain_specific`. Die zugehörige Datei `.opencode/policies/tierheim-retention.json` existiert nicht. Es gibt nur `data-retention.json`, die bereits Tierheim-Regeln enthält.

7. **PII-Detection ist zu breit**: Im Manifest-Detector `civic-tech-pii` (Zeilen 165–169) triggern generische Terme wie `"consent"`, `"privacy"` und `"retention"` bereits die Tierheim-Compliance-Regeln. Das führt zu Fehlalarmen in Projekten, die DSGVO-konform sein müssen, aber keine Tierheim-Domäne haben.

8. **issue-orchestrator.md sagt "never implement" aber opencode.jsonc erlaubt `edit: "ask"`**: `issue-orchestrator.md` Zeile 60 verbietet Code-Änderungen ("Do NOT implement code or make file edits yourself"). `opencode.jsonc` Zeile 135 gewährt jedoch `"edit": "ask"`, also Editierrecht mit Nachfrage. Das ist ein Widerspruch zwischen Agenten-Anweisung und Permission-Konfiguration.

9. **`selectManifestRecommendations()` hardcoded Skill-Namen statt aus dem Manifest zu lesen**: In `scripts/lib/manifest.mjs` Zeilen 116–126 werden Skills wie `"project-reality-refresh"`, `"run-card"`, `"project-bootstrap"` usw. hardcoded. Die Funktion sollte dynamisch aus dem Manifest lesen, welche Skills für den erkannten Projekttyp empfohlen werden.

10. **Validator `validateOptionalArtifacts()` ist ein Stub**: `scripts/validate-ecosystem.mjs` Zeilen 218–220: Die Funktion gibt immer `[]` zurück. Sie sollte optionale Artefakte validieren (z. B. vorhandene aber nicht eingebundene Skills, verwaiste Referenzen, fehlende ADRs).

11. **Doppelte Klassifizierungslogik in bootstrap-project.mjs und apply-repository-overlay.mjs**: Beide Skripte enthalten ähnliche Klassifizierungslogik (`GREEN_SAFE`, `AMBER_REVIEW`, `RED_BLOCK`, `TOOL_GAP`). Diese sollte in eine gemeinsame `classification.mjs` ausgelagert werden.

12. **Kein WORKING-METHOD.md existiert**: Es gibt keine zentrale menschenlesbare Arbeitsmethode, die alle Workflow-Regeln, Gates, Tiers und Truth Layers an einem Ort dokumentiert.

13. **Kein maschinenlesbarer Workflow-Policy existiert**: Es gibt keine `working-method.json`, die den gesamten Workflow in maschinenlesbarer Form definiert (Risk Tiers, Truth Layers, Gate-Chain, Pre-Flight-Checks).

## 5. Sicherheitsfolgen der aktuellen Lücken

- **Ohne Pre-Flight**: Agenten könnten auf Runtimes mit inkompatiblen Versionen arbeiten (z. B. OpenCode <1.15.0, Node.js <18), was zu undefiniertem Verhalten oder Sicherheitslücken führt.

- **Ohne Context Levels**: Keine Trennung zwischen Recherche (Cold), Analyse (Warm) und Implementierung (Hot). Ein Agent könnte im Cold-Zustand Implementierungen durchführen, ohne den Issue-Kontext oder relevante Policies geladen zu haben.

- **Ohne Hard-Constraint-Re-Injection**: Nach Context Compaction könnten kritische Sicherheits-Constraints (Write Protection, Deny-Regeln, Human Gates) aus dem Kontext fallen. Der Agent arbeitet dann ohne diese Einschränkungen weiter.

- **Ohne Risk Tiers**: Full Speckit wird pauschal für jede Änderung gefordert. Das führt zu unnötiger Komplexität und Reibung bei trivialen Änderungen (Tippfehler, Formatierung). Umgekehrt gibt es keine erhöhten Anforderungen für Security-Kritische Änderungen.

- **Ohne Verification Contract**: Completion Claims können nicht standardisiert überprüft werden. Ein Agent könnte `fixed` oder `complete` behaupten, ohne dass nachvollziehbare Kriterien erfüllt sind.

- **Ohne Red Tests**: Es gibt keine systematische Bestätigung, dass der aktuelle Stand tatsächlich fehlerhaft ist. Ein Greenfield-Test könnte auch ohne Fehler bestehen, was zu falschen Positivmeldungen führt.

- **Ohne Anti-Fake-Execution**: Es gibt keinen strukturellen Schutz gegen halluzinierte Tool-/Test-Ausführungen. Ein Agent könnte behaupten, `npm test` ausgeführt zu haben, ohne tatsächlichen Output vorzuweisen.

- **Ohne getrennte Owner Approvals**: Alle irreversiblen Operationen teilen sich aktuell ein Gate (`git push: deny`, `git commit: ask`). Ein Commit ist weniger riskant als ein Push oder Deploy. Die fehlende Granularität führt zu unnötigen Blockaden oder im schlimmsten Fall zu unkontrollierten Aktionen.

- **Deprecated `tools` Key**: OpenCode könnte die `tools`-Unterstützung in einer zukünftigen Version vollständig entfernen. Dann würden alle Tool-Filter des Ecosystems nicht mehr funktionieren, was zu unerwarteten Berechtigungen führt.

- **Globale Data-Retention**: Projekte ohne DSGVO-Relevanz laden unnötig Tierheim-spezifische Data-Retention-Regeln, was zu Verwirrung und Fehlentscheidungen bei der Datenhaltung führen kann.

## 6. Zielarchitektur

Die Zielarchitektur für die Canonical Working Method Layer sieht wie folgt aus:

### 6.1 Zentrale Dokumente

- **`WORKING-METHOD.md`** — Kanonischer, menschenlesbarer Workflow-Vertrag, der alle Standards, Regeln, Gates und Tiers dokumentiert.
- **`working-method.json`** — Maschinenlesbare Policy, die Workflow-Schritte, Risk Tiers, Truth Layers, Pre-Flight-Checks und Gate-Ketten in JSON-Schema-konformer Form definiert.

### 6.2 Neue Skills (6 Stück)

1. **`context-engineering`** — Verwaltet Cold/Warm/Hot Context Levels, Context Manifest und Hard-Constraint-Re-Injection.
2. **`risk-tier-routing`** — Klassifiziert Änderungen in Risk Tiers (LOW/MEDIUM/HIGH/CRITICAL) und steuert den Speckit-Umfang.
3. **`verification-contract`** — Definiert und prüft standardisierte Bedingungen für Completion Claims.
4. **`owner-approval-gate`** — Implementiert getrennte human-gated Approvals für Apply, Commit, Push, PR, Merge, Deploy, Skill Write, Memory Write.
5. **`anti-fake-execution`** — Validiert Tool-Output und Test-Ergebnisse durch strukturierte Beweisführung.
6. **`privacy-data-minimization`** — Generische PII-Regeln, Datenminimierung und Löschmechanismen (nicht domain-spezifisch).

### 6.3 Risk Tiers (getrennt von MCP Trust Tiers)

| Risk Tier | Beschreibung | Speckit-Umfang | Human Gate |
|-----------|-------------|----------------|------------|
| CRITICAL | Security Patch, Datenverlust | Vollständiger Speckit | Apply + Push |
| HIGH | Breaking Change, Architektur | Vollständiger Speckit | Apply |
| MEDIUM | Konfiguration, neue Features | Reduced (Spec + Tasks) | Commit |
| LOW | Tippfehler, Formatierung, Docs | Minimal (kein Speckit) | None |
| UNVERIFIED | Keine Klassifizierung möglich | Vollständiger Speckit | Push |

### 6.4 Agenten-Reihenfolge (Security vor Compliance)

Neue Default Run Order:

1. Reality Refresh
2. Run Card
3. Research
4. Planning
5. Architecture
6. **Security** ← verschoben von Position 7
7. **Compliance** ← verschoben von Position 6
8. Implementation
9. Tests
10. Documentation
11. Reviewer
12. Evidence-Abschluss

### 6.5 Domain-Entkopplung

- `security-agent` und `compliance-agent` werden von `domain_specific` zu `generic` verschoben.
- `data-retention.json` wird nur bei passenden Projektsignalen (civic-tech-pii, tierheim-civipet) geladen.
- `privacy-data-minimization` Skill wird generisch für alle Projekte bereitgestellt.
- PII-Detection im Manifest wird geschärft, um Fehlalarme zu vermeiden.

### 6.6 OpenCode-Konfiguration

- Migration von deprecated `tools` zu `permission`-basiertem Tool-Filtering.
- Beseitigung des Widerspruchs zwischen issue-orchestrator "never implement" und `edit: "ask"`.

### 6.7 Hermes-YAML-Bundle und Config-Example

- `.hermes/bundles/project-bootstrap.yaml` als natives YAML-Format.
- Config-Example für Hermes Write-Approvals (Skill-Write-Gate, Memory-Write-Gate).

### 6.8 Validator-Erweiterung

- `validateOptionalArtifacts()` wird mit 22 neuen Prüfungen implementiert:
  - Existenz aller referenzierten Skills, Agents, Policies
  - Validierung aller Risk Tier Definitionen
  - Prüfung der Truth Layer Konsistenz
  - Cross-Referenz zwischen WORKING-METHOD.md und working-method.json
  - Prüfung der Anti-Fake-Execution Rules
  - Validation der Owner-Approval-Gate-Konfiguration

## 7. Geplante Änderungen

### Phase 3: Context Engineering & Pre-Flight
- Pre-Flight Skill: OS/Shell/Runtime/Tool-Versionen checken vor Aufgabenbeginn.
- Cold/Warm/Hot Context Levels definieren.
- Context Manifest einführen.
- Hard-Constraint-Re-Injection nach Compaction.

### Phase 4: Risk-Based Routing
- Risk Tier Definitionen in `risk-tiers.json`.
- Risk Tier Klassifizierung in `risk-tier-routing` Skill.
- Speckit-Umfang an Risk Tier gekoppelt.
- Risk Tiers als `experimental.policies` in opencode.jsonc.

### Phase 5: Verification Contract
- `verification-contract` Skill.
- Maschinenlesbare Bedingungen in `verification-contract.json`.
- Integration mit Evidence Gates.

### Phase 6: Owner-Approval-Gates
- `owner-approval-gate` Skill.
- Getrennte Gates für Apply, Commit, Push, PR, Merge, Deploy, Skill Write, Memory Write.
- Integration mit `write-protection.json`.

### Phase 7: Anti-Fake-Execution
- `anti-fake-execution` Skill.
- Output-Validierung für jeden Tool-Call.
- Test-Ausführungsnachweise.
- Strukturierte Beweisführung.

### Phase 8: Five Truth Layers
- Truth Layer Hierarchie in `truth-layers.json`.
- Layer-0: `git status` vor jedem Claim.
- Layer-1: Test-Output erforderlich.
- Layer-2: Evidence-Dokumentation.
- Layer-3: Policies als autoritative Quelle.
- Layer-4: Chat-Historie mit niedrigster Priorität.

### Phase 9: Security before Compliance
- Agenten-Reihenfolge in `AGENTS.md` und `issue-orchestrator.md` anpassen.
- Security-Schritt vor Compliance-Schritt.
- Migration-Agent-Integration für Security-Validierung.

### Phase 10: Generic Privacy & Data Minimization
- `privacy-data-minimization` Skill.
- Generische PII-Detection und Data-Retention-Regeln.
- Domain-Entkopplung von Tierheim/CiviPet.

### Phase 11: Hermes YAML & Write-Approvals
- `.hermes/bundles/project-bootstrap.yaml`.
- Config-Example für Hermes Write-Approvals.
- Skill/Write-Approval in Hermes-Integration.
- Memory-Write-Approval in Hermes-Integration.

### Phase 12: OpenCode `tools` Deprecation
- Migration von `tools` zu `permission` in `opencode.jsonc`.
- Tool-Filtering über `permission.bash[*]`.
- Entfernen aller `tools`-Blöcke in Agent-Konfigurationen.

### Phase 13: Manifest Cleanup
- `security-agent` und `compliance-agent` von `domain_specific` zu `generic`.
- `tierheim-retention`-Policy anlegen oder aus Manifest entfernen.
- PII-Detection-Signale schärfen.

### Phase 14: Code Duplication
- `selectManifestRecommendations()` dynamisch machen.
- Klassifizierungslogik in `classification.mjs` auslagern.
- `validateOptionalArtifacts()` implementieren.

### Phase 15: WORKING-METHOD.md
- Kanonischer Workflow-Vertrag.
- Alle Standards, Gates, Tiers, Truth Layers dokumentiert.
- Referenz auf alle Policies und Skills.

### Phase 16: working-method.json
- Maschinenlesbare Workflow-Definition.
- JSON-Schema für Workflow-Validierung.
- Integration mit ecosystem.manifest.json.

### Phase 17: Technical Debt Consolidation
- `data-retention.json` conditional loading.
- `tierheim-retention`-Policy erstellen.
- `opencode.jsonc` cleanup (Beseitigung Widersprüche).

### Phase 18: Final Integration
- Cross-Referenz zwischen allen Dokumenten.
- Validator-Prüfungen.
- Integration-Tests.
- Rollout-Dokumentation.

## 8. Bekannte Grenzen

- **Hermes-Runtime-Live-Test bleibt `TOOL_GAP_HERMES_RUNTIME`**: Die Hermes-Runtime kann in dieser Umgebung nicht live getestet werden, da sie eine eigenständige Python-Installation und Konfiguration erfordert. Alle Hermes-Aussagen basieren auf der dokumentierten CLI (`hermes --help`) und den offiziellen Dokumentationen unter `https://hermes-agent.nousresearch.com/`.

- **OpenCode-Runtime-Verifikation erfordert tatsächlichen OpenCode-Prozess**: Die Konfigurationsvalidierung kann strukturell geprüft werden (JSON-Schema, Datei-Existenz), aber das tatsächliche Verhalten von OpenCode (z. B. wie `tools` vs. `permission` interpretiert wird) kann nur im laufenden OpenCode-Prozess getestet werden.

- **MCP-Live-Verifikation erfordert konfigurierte MCP-Server**: Ob MCP-Server wie `github`, `brave-search` oder `context7` tatsächlich funktionieren, kann nur getestet werden, wenn die entsprechenden Server konfiguriert und erreichbar sind. Aktuell sind alle MCPs standardmäßig deaktiviert.

- **Remote-CI in privaten Repositories bleibt ohne Owner-Approval `RED_BLOCK`**: Der Bootstrap klassifiziert Remote-CI-Vorschläge in privaten Repositories ohne explizite Owner-Approval als `RED_BLOCK`, da CI-Workflows Sicherheitsimplikationen haben (Secret-Exposure, Deployment-Trigger).

- **Speckit/Slash-Commands sind Community-Workflow, nicht OpenCode-native Funktionen**: OpenCode bietet keine nativen `/speckit.*` Slash-Commands. Die Speckit-Integration im Ecosystem ist ein Workflow, der manuell oder über den `spec-driven-development` Skill abgebildet wird.

- **Trust Tiers sind eine Ecosystems-Konvention, kein OpenCode-Feature**: OpenCode hat kein natives Trust-Tier-System. Die MCP Trust Tiers (0_readonly, 1_sandboxed, 2_trusted) sind eine Konvention des Ecosystems, die durch Policies und Konfiguration abgebildet wird.

- **Hermes-YAML-Bundles sind ein Projektformat, nicht Hermes-native**: Hermes unterstützt keine nativen YAML-Bundle-Dateien. Das geplante `.hermes/bundles/project-bootstrap.yaml` wäre ein Projektformat, das Hermes über `skills.external_dirs` angebunden werden kann.

## 9. Offene Runtime-Tool-Gaps

- **`TOOL_GAP_HERMES_RUNTIME`**: Kein Live-Test der Hermes-Runtime möglich. Alle Hermes-Aussagen basieren auf CLI-Output und Dokumentation. Ein vollständiger Integrationstest erfordert eine laufende Hermes-Installation.

- **`TOOL_GAP_OPENCODE_RUNTIME_VERIFICATION`**: OpenCode Runtime-Verifikation (wie `tools` vs. `permission` konkret interpretiert wird, Verhalten von `compaction.auto`) ist nur strukturell prüfbar. Tatsächliches Laufzeitverhalten erfordert einen OpenCode-Prozess.

- **`TOOL_GAP_MCP_LIVE`**: MCP Live-Verifikation erfordert konfigurierte und erreichbare MCP-Server. Aktuell sind alle MCPs deaktiviert und die benötigten API-Keys (`GITHUB_TOKEN`, `BRAVE_API_KEY`) möglicherweise nicht in der Testumgebung verfügbar.

- **`TOOL_GAP_SPECKIT_INTEGRATION`**: Keine native Speckit-Integration in OpenCode. Der Workflow muss über den `spec-driven-development` Skill oder manuelle Schritte abgebildet werden.

- **`TOOL_GAP_HERMES_YAML_BUNDLES`**: Hermes unterstützt keine nativen YAML-Bundles. Das Format ist eine Projektkonvention. Die Integration erfolgt über `skills.external_dirs` in der Hermes-Config.

## 10. Bereits gelöst (Regression-Invarianten)

Diese Findings aus PR #1 sind bereits behoben und gelten als Regression-Invarianten:

1. **Overlay-Apply funktioniert durch korrekten `ensureParentDirectory`-Import**: `scripts/apply-repository-overlay.mjs` importiert `ensureParentDirectory` korrekt aus `scripts/lib/paths.mjs` und verwendet es für die Erstellung von Zielverzeichnissen vor Dateioperationen.

2. **`--rollback` ohne Wert wird abgewiesen**: Der Rollback-Mechanismus in `scripts/bootstrap-project.mjs` validiert, dass ein Verzeichnispfad übergeben wurde, und weist `--rollback` ohne Wert mit einer Fehlermeldung ab.

3. **`RED_BLOCK` wird nicht mehr durch Konflikte maskiert**: Die Klassifizierungslogik stellt sicher, dass `RED_BLOCK` (z. B. durch unsichere Write-Requests) nicht durch `AMBER_REVIEW` (Merge-Konflikte) maskiert wird. Der schwerwiegendere Status setzt sich durch.

4. **Symlinks werden mit `lstat` geprüft**: `scripts/lib/paths.mjs` verwendet `fs.lstat()` für Symlink-Erkennung, um Symlink-Angriffe (symlink escapes) zu blockieren. Jeder Pfadsegment wird einzeln mit `lstat` geprüft.

5. **Globale Installation besitzt Root-/Sudo-Guard**: `scripts/install-global.mjs` weist die Ausführung als root oder mit `sudo` ab. Die Installation operiert ausschließlich auf User-Level-Konfiguration.

6. **Restore validiert das erwartete Zielverzeichnis**: Der Rollback-Mechanismus prüft vor dem Zurückschreiben, ob das Zielverzeichnis dem erwarteten Projektverzeichnis entspricht, um Pfad-Escape-Angriffe zu verhindern.

7. **Merge-Berichte unterscheiden „erhalten" und „gemergt" korrekt**: Der Merge-Prozess in `scripts/lib/merge.mjs` dokumentiert für jede Datei, ob sie unverändert erhalten wurde (`PRESERVED`), gemergt wurde (`MERGED`) oder ein Konflikt vorliegt (`CONFLICT`).

8. **Hermes-Bundle enthält keine doppelten Skills**: `scripts/lib/hermes.mjs` dedupliziert Skills beim Bundle-Export über `[...new Set(skills)]`.

9. **Verschachtelte `node_modules` werden ignoriert**: Die Discovery in `scripts/lib/discovery.mjs` ignoriert `node_modules`-Verzeichnisse auf allen Ebenen, um Rauschen in der Projektanalyse zu vermeiden.

10. **Test-Ignore-Prüfungen funktionieren korrekt**: Das Test-Framework ignoriert systemabhängige Pfade korrekt und unterscheidet zwischen Linux/macOS/Windows-Pfadformaten.
