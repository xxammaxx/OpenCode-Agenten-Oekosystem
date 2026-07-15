---
name: worktree-safety
description: Validates target roots, protects against path traversal, and blocks symlink escapes.
license: MIT
compatibility: opencode
metadata:
  audience: bootstrap
  workflow: safety
  hermes: compatible
---

## When To Use

Use this skill before any file write or rollback operation.

## Workflow

1. Resolve the target path.
2. Verify the path stays inside the workspace.
3. Refuse writes through escaping symlinks.
4. Keep all backup and restore paths root-contained.

## Inputs

- target project path
- planned file list
- backup location

## Outputs

- safe path plan
- blocked path list
- root containment status

## Security Boundaries

- no shell interpolation
- no unverified absolute user paths
- no writes outside the target root

## Completion Criteria

- every planned path is root-contained
- symlink escape attempts are blocked

