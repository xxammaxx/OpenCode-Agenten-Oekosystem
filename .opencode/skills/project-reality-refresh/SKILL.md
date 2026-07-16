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

Use this skill before any architecture, provider, MCP, security, or bootstrap work. This skill is the foundation of the Reality Refresh step in the Canonical 22-Step Execution Order.

## Core Principle: Reality Wins

Der tatsächliche Runtime- und Repository-Zustand hat immer Vorrang vor Dokumentation, Speicher oder Behauptungen. See WORKING-METHOD.md § Core Principles and § Truth Layers.

## Truth Layers Awareness

This skill operates primarily at **Layer 0 (Reality Truth)** — the actual repository and runtime state on disk. Its output feeds into the Context Manifest which determines the project's truth state across all 5 layers:

| Layer | Name | Description |
|-------|------|-------------|
| 0 | **Reality Truth** | Actual runtime/repository state (disk, processes, tools) |
| 1 | **Executable Truth** | Runnable code, tests, configuration, schemas |
| 2 | **Evidence Truth** | Reproducible logs, screenshots, test output, diffs |
| 3 | **Documentation Truth** | Issues, ADRs, reports, policies, run reports |
| 4 | **Memory/Chat Context** | Chat history, agent memory files, embeddings |

## Workflow

1. Read the repo instructions and safety files.
2. Read the target project and current config files.
3. Validate repository state (git status, git diff --stat, uncommitted changes).
4. Detect OS, shell, runtime, and available tools (Pre-Flight discovery).
5. Record validated facts and explicit uncertainties.
6. Distinguish repo-source truth from target-project truth.
7. Feed findings into the Context Manifest for Risk Tier and Context Level determination.

## Inputs

- repository URL or local repo path
- target project path
- current config files
- current docs and policies

## Outputs

- discovery summary
- validated facts list
- uncertainty list
- tool/runtime manifest
- input for Context Manifest creation
- follow-up questions only when needed

## Security Boundaries

- do not read secrets
- do not assume missing files exist
- do not write files during refresh
- do not claim runtime state without actual discovery

## Completion Criteria

- facts are verified from source files, official docs, or actual runtime discovery
- uncertainties are explicit
- no hidden assumptions remain
- output is ready to feed into the Context Manifest

