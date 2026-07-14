---
name: remote-ci-approval-gate
description: Prevents remote CI workflows from being copied or enabled without explicit opt-in.
license: MIT
compatibility: opencode
metadata:
  audience: bootstrap
  workflow: ci
  hermes: compatible
---

## When To Use

Use this skill when any GitHub Actions or other remote CI workflow is under consideration.

## Workflow

1. Detect workflow files.
2. List them explicitly.
3. Require the opt-in flag before proposing installation.
4. Keep them disabled by default.
5. Never activate them automatically.

## Inputs

- `.github/workflows` contents
- opt-in flag
- target project policy

## Outputs

- workflow proposal list
- explanation of why each workflow is or is not included

## Security Boundaries

- no automatic CI enablement
- no secret assumption
- no releases or package publishing

## Completion Criteria

- every workflow is explicitly named
- the opt-in requirement is clear
- no CI is silently copied

