---
name: architecture-review
description: Documents and validates architecture decisions using the ADR (Architecture Decision Record) format. Evaluates coupling, cohesion, dependencies, and alternatives before changes. Produces immutable, traceable decision records.
license: MIT
compatibility: opencode
metadata:
  audience: architecture-agent
  workflow: architecture
---
## Core Principle

Every significant architectural decision must be documented as an ADR. ADRs are immutable — superseded by new ADRs when decisions change. No architectural change without documented tradeoff analysis.

## When to Create an ADR

Create an ADR when:
- Introducing a new dependency or framework
- Changing the system architecture (new service, new pattern)
- Deprecating a technology or approach
- Making a significant data model change
- Changing deployment or infrastructure patterns
- Choosing between multiple viable alternatives

Use the ADR template: `.opencode/templates/adr-template.md`

## Review Dimensions

### Coupling Analysis
- Afferent coupling (Ca): Who depends on this module?
- Efferent coupling (Ce): What does this module depend on?
- Instability (I = Ce/(Ca+Ce)): 0 = stable, 1 = unstable
- Abstractness (A): Ratio of abstract to concrete types

### Cohesion Analysis
- Does the module have a single responsibility?
- Are all functions related to the same purpose?
- Would splitting/merging improve clarity?

### Dependency Evaluation
- Is the new dependency actively maintained?
- License compatibility with project?
- Security track record (recent CVEs)?
- Bundle size / performance impact?
- Is there a lighter alternative?

### Alternatives Considered (mandatory)
For every decision, document at least 2 alternatives:
1. **Option A:** Chosen approach — with justification
2. **Option B:** Next best alternative — why rejected
3. **Option C (optional):** Status quo or radical alternative

## ADR Lifecycle
1. **Proposed:** Initial draft, under review
2. **Accepted:** Approved and active
3. **Deprecated:** No longer applies (but kept for history)
4. **Superseded:** Replaced by newer ADR (reference which one)

## Prohibited
- Making architectural changes without ADR
- Approving ADRs without evaluating alternatives
- Modifying accepted ADRs (supersede with new ADR instead)
