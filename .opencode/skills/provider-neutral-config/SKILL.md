---
name: provider-neutral-config
description: Preserves existing provider and model config while recommending capability profiles instead of vendor lock-in.
license: MIT
compatibility: opencode
metadata:
  audience: bootstrap
  workflow: config
  hermes: compatible
---

## When To Use

Use this skill whenever a config would otherwise force Claude, OpenAI, Ollama, DeepSeek, or specific model IDs.

## Workflow

1. Detect existing provider and model choices.
2. Preserve them if the target project already defines them.
3. Prefer capability labels such as `heavy_reasoning` and `fast_review`.
4. Avoid hardcoded vendor defaults unless they are only examples.

## Inputs

- existing OpenCode config
- existing Hermes config
- manifest recommendations

## Outputs

- neutral config overlay
- capability-based model recommendations
- notes about preserved user choices

## Security Boundaries

- no forced provider migration
- no forced model override
- no unreviewed local fallback claims

## Completion Criteria

- existing provider settings remain intact
- model mapping stays configurable
- docs explain capability profiles, not vendor lock-in

