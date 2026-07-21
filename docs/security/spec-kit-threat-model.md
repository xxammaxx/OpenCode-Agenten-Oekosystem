# Threat Model: Spec-Kit-Integration

## Schutzannahme (`STRUCTURAL`)

Spec-Kit-Prompts und Hooks sind keine Sicherheitsgrenze. Die Bridge delegiert
an den bestehenden Kernel; ungültige Eingaben, fehlende Ausgaben und interne
Fehler werden nicht erlaubend behandelt.

## Nachgewiesene Kontrollen

`LOCALLY_TESTED`: absolute Projektpfade, Symlink-Projektwurzel,
Scope-Prüfung, argv-basierter Launcher ohne `shell:true`, Receipt-Binding,
Expiry, Replay, atomare Parallelitäts-Sperre, Prozessneustart und
Secret-freie Receipt-Struktur.

`RUNTIME_VERIFIED`: Zwei frische OpenCode-Prozesse forderten den RED-Sentinel
über den echten `bash`-Toolpfad an. Der Runtime-Adapter blockierte vor dem
Seiteneffekt; der Sentinel blieb unverändert.

## Offene Risiken / Tool-Gaps

- Die Receipt-Integrität ist lokale unkeyed Tamper-Erkennung, keine
  kryptografische Owner-Authentisierung.
- Zwischen letzter Gate-Prüfung und externem Tool-Seiteneffekt bleibt ein
  residuales TOCTOU-Fenster.
- Spec Kit 0.13.0 prüft Bundle-Archiv-SHA nicht, obwohl der lokale Catalog ein
  Feld enthält.
- Bundle-Update überschreibt installierte Extensions nicht zuverlässig;
  Bundle-Downgrade/Rollback ist nicht implementiert.
- `opencode debug config` gibt in OpenCode 1.15.13 im nativen Resolved-Config-
  Serializer Credential-Material aus. Das Finding wurde mit einem synthetischen
  Sentinel in zwei frischen isolierten Prozessen reproduziert. Ownership liegt
  beim Upstream-OpenCode-Diagnosepfad, nicht bei der Spec-Kit-Integration.
- Projektkontrollierte Bridge-, Launcher-, Plugin-, Error-, JSON- und
  Evidence-Ausgaben verwenden eine zentrale Redaction-Hilfe. 28 Redaction-
  Tests, Bridge-Tests und rekursive Scans fanden dort keine unredigierten
  aktuellen Sentinel-Vorkommen. Diese Abwehr behebt den nativen OpenCode-Pfad
  nicht; der Befund bleibt als `UPSTREAM_SECURITY_RISK` außerhalb des
  unterstützten Projektpfads sichtbar.
- Spec Kit 0.13.0 prüft Bundle-Archiv-SHA nicht, obwohl der lokale Catalog ein
  Feld enthält; Bundle-Update und Bundle-Downgrade/Rollback sind nicht als
  nativer Lifecycle bewiesen. Klassifikation:
  `TOOL_GAP_SPECKIT_0_13_BUNDLE_LIFECYCLE`. Die Capability-Matrix steht in
  `evidence/spec-kit-assurance-20260720T193425Z/10-bundle-capability-matrix.md`.

## Klassifikation

`GREEN_SAFE` für den bewiesenen Projektumfang, mit
`APPROVED_WITH_FINDINGS` aus dem technisch getrennten Read-only-Review. Der
native Credential-Befund ist ein außerhalb des unterstützten Projektpfads
liegender Upstream-Risikohinweis; der Bundle-Lifecycle bleibt eine Capability-
Grenze und wird nicht als native Unterstützung behauptet.
