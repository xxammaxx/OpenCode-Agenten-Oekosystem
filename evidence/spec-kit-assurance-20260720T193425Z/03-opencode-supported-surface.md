# Unterstützte OpenCode-Oberfläche

Assurance-Lauf: `20260720T193425Z`.

## Trust Boundary

Der projektseitig unterstützte Pfad beginnt bei den Projekt-Commands, dem
Bridge-Launcher, dem Runtime-Adapter und dem Managed-Runtime-Smoke. Diese
Pfade durchlaufen die zentrale Redaction-Schicht, bevor stdout, stderr,
Fehlerobjekte oder Evidence persistiert werden. Der Runtime-Kernel bleibt für
die eigentliche Autorisierung maßgeblich; Hooks und Diagnoseausgaben sind
nicht die Sicherheitsgrenze.

Der native Befehl `opencode debug config` verwendet OpenCodes eigenen
Serializer und eigene Logablage. Er wird vom Projekt nicht aufgerufen,
gedokumentiert, gewrappt oder als Diagnose empfohlen. Dieser Pfad ist deshalb
`NOT_SUPPORTED` für das Projekt und als `UPSTREAM_SECURITY_RISK` klassifiziert.
Das bedeutet ausdrücklich keine globale OpenCode-Credential-Garantie.

## Matrix

| Pfad/Funktion | Kontrolliert | Dokumentiert/unterstützt | Normal erreichbar | Redaction | Rohdaten vor Persistenz | Capability |
|---|---:|---:|---:|---:|---:|---|
| Native `opencode debug config` und native OpenCode-Logs | nein | nein | nein | nein | ja, Upstream | `UPSTREAM_SECURITY_RISK`, `NOT_SUPPORTED` |
| Projekt-Bridge `run-bridge.mjs` | ja | ja | ja | ja, fail-closed | nein | `E2E_VERIFIED` |
| `evaluate-operation.mjs` | ja | ja | ja | ja | nein | `E2E_VERIFIED` |
| OpenCode-Runtime-Adapter | ja | ja | ja | ja | nein | `RUNTIME_VERIFIED` |
| Managed Runtime Smoke / `run-governed-opencode.mjs` | ja | ja | ja | ja | nein | `RUNTIME_VERIFIED` |
| Bridge-Child-Prozesse | ja | ja | ja | stdout/stderr getrennt | nein | `LOCALLY_TESTED` |
| Workflow-Phasen Reality/Route/Before/Verify/Close | ja | ja | ja | ja | nein | `E2E_VERIFIED` |
| Extension Launcher und Preflight-Command | ja | ja | ja | ja; Argumentinhalte werden nicht ausgegeben | nein | `LOCALLY_TESTED` |
| Bootstrap, Overlay, Install-/Governance-Wrapper | ja | ja | ja | ja | nein | `LOCALLY_TESTED` |
| Validator und Gate-Ausgaben | ja | ja | ja | ja | nein | `LOCALLY_TESTED` |
| stdout und stderr der unterstützten Prozesse | ja | ja | ja | getrennt | nein | `LOCALLY_TESTED` |
| Fehlerobjekte, Stacks und Fallback-Fehler | ja | ja | ja | ja; unbekanntes Format unterdrückt | nein | `LOCALLY_TESTED` |
| Report-/Evidence-Writer | ja | ja | ja | vor JSON/Markdown-Persistenz | nein | `LOCALLY_TESTED` |
| Approval-State und Ledger | ja | ja | ja | keine Credential-Rohdaten | nein | `E2E_VERIFIED` |
| Environment-Diagnosen | ja | ja | ja | Namen/Metadaten ohne Werte | nein | `LOCALLY_TESTED` |
| Workflow-Ausgaben und Restart-Prozesse | ja | ja | ja | ja | nein | `E2E_VERIFIED` |

## Abgrenzung

Native OpenCode-Serializer-, Debug- und Logpfade außerhalb dieser Matrix
werden nicht als projektseitig sicher behauptet. Bei einem nicht parsebaren
oder nicht sicher redigierbaren Bridge-Ergebnis wird die Ausgabe unterdrückt,
ein sicherer `RED_BLOCK`-Fehler erzeugt und der ursprüngliche Exit-Status
bewahrt.

Die Detailaufnahme steht außerdem in
`02-supported-surface-inventory.md`. Offizielle OpenCode-Oberflächenreferenzen
sind die CLI-, Config- und Troubleshooting-Dokumentation; sie begründen die
Upstream-Grenze, nicht eine projektseitige Sicherheitszusage.
