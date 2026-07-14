---
name: project-bootstrap
description: Orchestrates safe OpenCode and Hermes project bootstraps from discovery through validation.
license: MIT
compatibility: opencode
metadata:
  audience: bootstrap
  workflow: project-bootstrap
  hermes: compatible
---

## When To Use

Use this skill to bootstrap a target project from this repository.

## Workflow

1. Refresh reality.
2. Build the run card.
3. Select minimal agents, skills, policies, and MCPs.
4. Dry-run the overlay.
5. Apply only with `--apply`.
6. Validate, report, and keep rollback data.

## Inputs

- target project path
- ecosystem manifest
- discovery results
- existing config files

## Outputs

- merged OpenCode config
- portable Hermes bundle
- bootstrap reports
- backup manifest

## Security Boundaries

- dry-run is default
- existing files are not blindly overwritten
- global config is untouched unless explicitly requested
- remote CI remains opt-in

## Completion Criteria

- target project is analyzed
- files are merged safely
- validation passes or reports are explicit

