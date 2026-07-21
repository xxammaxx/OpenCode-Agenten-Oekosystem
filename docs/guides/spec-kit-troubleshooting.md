# Troubleshooting

- **Tool Gap:** Fehlt OpenCode, Node oder ein erforderliches Tool, bleibt der
  betroffene Claim ungeprüft und wird nicht zu GREEN aufgewertet.
- **Sandbox `EPERM`:** Installations- und Child-Prozess-Tests benötigen in
  dieser Umgebung eine lokale Ausführungsfreigabe. Das ist kein Produkt-
  Ergebnis; der Test ist erst nach erfolgreicher Wiederholung zu klassifizieren.
- **Workflow im Bundle schlägt mit `--dev source` fehl:** Spec Kit 0.13.0
  delegiert den Workflow-Befehl in-process und übergibt den Typer-Default
  fehlerhaft. Workflow separat aus dem Catalog installieren; diesen Workaround
  nicht als vollständigen Bundle-Beweis zählen. Stufe: `TOOL_GAP`.
- **Bundle-Update meldet Extension bereits installiert:** Der Upstream-
  Bundle-Refresh reicht keinen `--force`-/Update-Pfad an die Extension-Primitive
  weiter. Bundle-Update nicht als erfolgreich dokumentieren.
- **Rollback wird als „up to date“ gemeldet:** Der Workflow-Update-Befehl
  unterstützt nur Upgrades, keine Downgrades. Ein Entfernen und Neuinstallieren
  ist kein atomischer Rollback-Beweis.
- **Bundle-SHA wird nicht abgelehnt:** Spec Kit 0.13.0 prüft `sha256` im
  Bundle-Catalog-Eintrag nicht; Extension-/Preset-SHA-Prüfung funktioniert.
- **Workflow pausiert:** Resume muss die Receipt und den aktuellen HEAD erneut
  binden. Ein geänderter HEAD stoppt den Resume-Versuch.
- **Ungültige Bridge-Antwort:** stdout, Exit-Code und Pflichtfelder prüfen und
  fail-closed als `RED_BLOCK` behandeln.
- **Secret in Log/Diagnose:** Wert nicht kopieren oder Evidence hinzufügen;
  Fundstelle redigieren und die zuständige Secret-Rotation eskalieren.
- **Credential in `opencode debug config`:** Dies ist in OpenCode 1.15.13 ein
  reproduzierter `UPSTREAM_SECURITY_RISK` im nativen Resolved-Config-
  Serializer. Der Befehl ist kein unterstützter Projektpfad; niemals mit
  realen Credentials ausführen. Für eine Reproduktion ausschließlich
  synthetische Werte und einen isolierten XDG-/Home-Root verwenden. Die
  projektkontrollierte Bridge, der Launcher, das Plugin und die Evidence-
  Writer redigieren stdout/stderr, JSON, Error-Objekte und Stacks zentral.
  Evidence: `evidence/spec-kit-assurance-20260720T193425Z/04–09-*`.
- **Raw `$ARGUMENTS` im Preflight:** Der Preflight-Command meldet nur Präsenz
  und Länge. Inhalte dürfen nicht in Prompts, Logs, Workflow-State oder
  Evidence wiederholt werden.
