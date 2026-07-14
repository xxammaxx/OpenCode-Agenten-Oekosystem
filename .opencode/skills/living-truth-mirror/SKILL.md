---
name: living-truth-mirror
description: Keeps manifest, architecture, docs, and reports aligned as a living truth mirror.
license: MIT
compatibility: opencode
metadata:
  audience: bootstrap
  workflow: documentation
  hermes: compatible
---

## When To Use

Use this skill when machine truth, technical truth, and user truth must stay synchronized.

## Workflow

1. Update the manifest and validator outputs.
2. Update the architecture doc and ADR.
3. Update README or bootstrap entry docs.
4. Keep examples and reports in sync with implementation.

## Inputs

- validated discovery
- implementation changes
- test evidence

## Outputs

- manifest updates
- architecture map
- run report
- user-facing bootstrap docs

## Security Boundaries

- no fictional facts
- no stale examples
- no ungrounded claims of compatibility

## Completion Criteria

- truth layers agree
- docs match code paths
- reports mention uncertainties

