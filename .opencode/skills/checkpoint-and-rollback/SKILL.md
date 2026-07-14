---
name: checkpoint-and-rollback
description: Creates backups, manifests, and rollback steps before project writes.
license: MIT
compatibility: opencode
metadata:
  audience: bootstrap
  workflow: rollback
  hermes: compatible
---

## When To Use

Use this skill whenever apply mode could modify existing files.

## Workflow

1. Snapshot the files that may change.
2. Write the backup manifest and hashes.
3. Preserve the rollback command.
4. Test restore before claiming the change is safe.

## Inputs

- file list
- target root
- planned overlay

## Outputs

- backup directory
- backup manifest
- rollback command

## Security Boundaries

- no destructive cleanup before validation
- no secret material in backup reports
- no rollback without a manifest

## Completion Criteria

- backup exists before writes
- restore works against the same file set
- rollback command is reproducible

