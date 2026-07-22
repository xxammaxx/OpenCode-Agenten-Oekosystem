# opencode-agent-ecosystem bundle

This is a pinned Spec Kit 0.13.x bundle manifest. Component source repositories
are recorded for provenance; the components themselves must be available from
the active local/project catalogs or already installed before an offline bundle
install. The bundle does not add kernel behavior.

This bundle is project-internal and is not published to a community catalog.

## Capability boundary

`STRUCTURAL`: the manifest and component provenance are present and pinned.
Local catalog discovery and manifest validation are `NATIVE_VERIFIED`;
standalone extension/preset install plus scoped removal/reinstall are
`PROJECT_LAYER_VERIFIED`. A complete three-component install, workflow
delegation, bundle update, bundle-level SHA verification, downgrade, and
atomic rollback are `TOOL_GAP_SPECKIT_0_13_BUNDLE_LIFECYCLE` with Spec Kit
0.13.0. This project does not provide a compatibility layer and does not claim
those native Spec-Kit guarantees. See
`evidence/spec-kit-assurance-20260720T193425Z/10-bundle-capability-matrix.md`.
