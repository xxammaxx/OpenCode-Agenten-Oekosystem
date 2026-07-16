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

Use this skill when the 5 Truth Layers must stay synchronized after implementation. This skill is invoked after the Reality Gate (Step 14 of the Canonical 22-Step Execution Order).

## Truth Layers Hierarchy

The skill verifies alignment across all 5 layers. Higher layers may override lower layers, but never the reverse.

| Layer | Name | Override Rule |
|-------|------|---------------|
| 0 | **Reality Truth** — Actual disk, processes, runtime | Highest priority, overrides all others |
| 1 | **Executable Truth** — Runnable code, tests, config, schemas | Can only be overridden by Layer 0 |
| 2 | **Evidence Truth** — Reproducible logs, screenshots, diffs | Can only be overridden by Layer 0–1 |
| 3 | **Documentation Truth** — Issues, ADRs, reports, policies | Can only be overridden by Layer 0–2 |
| 4 | **Memory/Chat Context** — Chat history, agent memory, embeddings | Must never override higher layers |

### Conflict Resolution

When layers disagree:
1. Document the conflict
2. Mark the stale source as `STALE`
3. Base decisions on the higher-priority layer
4. Propose updates to the stale source

## Workflow

1. Validate that the actual repository state (Layer 0) matches the executable truth (Layer 1) — run `git diff --stat`, check file existence.
2. Verify evidence (Layer 2) — test outputs, screenshots, logs — against the implementation.
3. Update documentation (Layer 3) — README, ADRs, policies, run reports — to match the new state.
4. Ensure memory/chat context (Layer 4) does not contradict higher layers.
5. Mark any stale sources with explicit `STALE` annotations.
6. Update the manifest and validator outputs.
7. Keep examples and reports in sync with implementation.

## Inputs

- validated discovery (from Reality Refresh)
- implementation changes (git diff)
- test evidence (test outputs, logs)
- Context Manifest (Risk Tier, Context Level)

## Outputs

- manifest updates
- architecture map
- run report
- `STALE` annotations for outdated sources
- user-facing bootstrap docs

## Security Boundaries

- no fictional facts
- no stale examples
- no ungrounded claims of compatibility
- no claiming alignment without actual verification
- do not modify layers 0-1 without verification

## Completion Criteria

- **All 5 Truth Layers agree:** Reality (disk) ↔ Executable (code/tests) ↔ Evidence (logs/diffs) ↔ Documentation (docs/reports) ↔ Memory (chat context)
- Docs match code paths
- Reports mention uncertainties
- Any `STALE` sources are explicitly annotated
- No unverified claims about layer alignment

