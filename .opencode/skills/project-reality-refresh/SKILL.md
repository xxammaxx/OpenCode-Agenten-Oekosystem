---
name: project-reality-refresh
description: Refreshes repository and target-project reality before planning or writing code.
license: MIT
compatibility: opencode
metadata:
  audience: bootstrap
  workflow: reality-refresh
  hermes: compatible
---

## When To Use

Use this skill before any architecture, provider, MCP, security, or bootstrap work.

## Workflow

1. Read the repo instructions and safety files.
2. Read the target project and current config files.
3. Record validated facts and explicit uncertainties.
4. Distinguish repo-source truth from target-project truth.

## Inputs

- repository URL or local repo path
- target project path
- current config files
- current docs and policies

## Outputs

- discovery summary
- validated facts list
- uncertainty list
- follow-up questions only when needed

## Security Boundaries

- do not read secrets
- do not assume missing files exist
- do not write files during refresh

## Completion Criteria

- facts are verified from source files or official docs
- uncertainties are explicit
- no hidden assumptions remain

