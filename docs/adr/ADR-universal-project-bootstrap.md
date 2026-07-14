# ADR-0001: Universal Project Bootstrap for OpenCode and Hermes

**Status:** Proposed

**Date:** 2026-07-14

**Deciders:** OpenCode Agent Ecosystem maintainers

## Context

The repository currently behaves mostly like a global OpenCode installer with repository-scoped documentation. That approach is too brittle for arbitrary target projects because it:

- assumes a static model/provider setup
- mixes domain-specific and generic policy guidance
- installs global configuration without a safe project-local discovery step
- leaves Hermes integration implicit
- lacks a manifest, backup, rollback, and explicit remote CI gate

We need a universal bootstrap that another AI can use from only the repository URL and a target project path.

## Decision

Implement a manifest-driven, project-local bootstrap pipeline that:

- defaults to dry-run
- performs target project discovery before any write
- selects the minimal set of agents, skills, MCPs, and policies from a machine-readable manifest
- preserves existing project config when present
- generates portable Hermes bundle assets instead of rewriting global Hermes config
- creates backups before apply
- supports rollback from the backup manifest
- treats remote CI as opt-in only

## Alternatives Considered

### Option A: Keep the global-only installer

- Pros: minimal code changes
- Cons: does not solve project discovery, safe merge, or Hermes portability
- Why chosen: not sufficient

### Option B: Manual copy instructions in docs only

- Pros: low implementation cost
- Cons: not automatable, easy to misuse, no rollback
- Why rejected: does not satisfy the bootstrap goal

### Option C: Manifest-driven project-local bootstrap with backups

- Pros: safe by default, portable, testable, and target-project aware
- Cons: more code and more validation work
- Why chosen: best match for the desired universal bootstrap behavior

## Consequences

### Positive

- safer target-project onboarding
- explicit dry-run review
- deterministic validation
- portable Hermes handoff
- easier testing and future extension

### Negative

- more files and moving parts
- need to maintain a manifest and helper scripts
- Hermes runtime integration remains a portable bundle rather than a silent home-config rewrite

### Neutral

- repository becomes more documentation-heavy
- global installer remains available but is no longer the main path

## References

- [BOOTSTRAP.md](../../BOOTSTRAP.md)
- [ecosystem.manifest.json](../../ecosystem.manifest.json)
- OpenCode config docs: https://opencode.ai/docs/config/
- OpenCode agents docs: https://opencode.ai/docs/agents/
- Hermes CLI help from the installed binary
