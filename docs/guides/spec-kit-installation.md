# Spec-Kit-Installation lokal

Getestet wurde Spec Kit `0.13.0` vom Tag `v0.13.0`, SHA
`9a30db484b0876cb7e5a391cf735d59bd968e985`. Capability-Stufe:
`LOCALLY_TESTED` für die ausdrücklich getesteten Einzel- und Catalog-
Primitive; kein vollständiger Bundle-Lifecycle-Claim.

## Einzelne Primitive

```bash
SPECIFY="$PWD/.tmp/spec-kit-v0.13.0/venv/bin/specify"
"$SPECIFY" init /tmp/my-spec-project --force --integration opencode \
  --ignore-agent-tools
cd /tmp/my-spec-project
"$SPECIFY" extension add --dev "$OLDPWD/integrations/spec-kit/extensions/opencode-evidence"
"$SPECIFY" preset add --dev "$OLDPWD/integrations/spec-kit/presets/opencode-canonical-method"
"$SPECIFY" workflow add --dev "$OLDPWD/integrations/spec-kit/workflows/opencode-safe-delivery"
```

## Lokaler Catalog

Die Dateien unter `integrations/spec-kit/catalogs/` sind ein nicht
veröffentlichter Test-Catalog. Sie zeigen das Spec-Kit-Schema und verwenden
Loopback-Artefakt-URLs. Für den Closure-Test wurden zusätzlich die drei
Primitive-Catalogs registriert:

```bash
"$SPECIFY" bundle catalog add http://127.0.0.1:8765/opencode-agent-ecosystem.catalog.json \
  --policy install-allowed --priority 1 --id local-closure
"$SPECIFY" extension catalog add http://127.0.0.1:8765/opencode-evidence.catalog.json \
  --name local-closure-extension --priority 1 --install-allowed
"$SPECIFY" preset catalog add http://127.0.0.1:8765/opencode-canonical-method.catalog.json \
  --name local-closure-preset --priority 1 --install-allowed
"$SPECIFY" workflow catalog add http://127.0.0.1:8765/opencode-safe-delivery.catalog.json \
  --name local-closure-workflow
```

Search/Info und Extension-/Preset-Installation sind lokal belegt. Ein
vollständig sauberer Drei-Komponenten-Bundle-Install ist mit Spec Kit 0.13.0
nicht belegt: der Bundle-Workflow-Delegator verwendet intern einen falschen
Typer-Default. Bundle-Update, Bundle-SHA-Prüfung, Downgrade und atomarer
Rollback sind ebenfalls `TOOL_GAP_SPECKIT_0_13_BUNDLE_LIFECYCLE`; siehe
`evidence/spec-kit-assurance-20260720T193425Z/10-bundle-capability-matrix.md`.

Diese Fähigkeiten dürfen nicht als native Spec-Kit-0.13.0-Unterstützung
dokumentiert werden. Es wurde keine projektseitige Compatibility Layer
implementiert.

Der Upstream wurde nicht gepatcht und keine globale Installation verändert.

Keine globale CLI, keine `latest`-Referenz und keine öffentliche Catalog-
Veröffentlichung verwenden.
