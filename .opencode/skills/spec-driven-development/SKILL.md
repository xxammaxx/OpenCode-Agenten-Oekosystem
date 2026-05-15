---
name: spec-driven-development
description: Enforces the Speckit workflow for all feature development. No implementation code before specification, acceptance criteria, and test definitions are complete. Blocks premature implementation.
license: MIT
compatibility: opencode
metadata:
  audience: issue-orchestrator
  workflow: speckit
---
## Core Principle

No implementation without a specification. The Speckit workflow is mandatory for all feature work. Each phase must complete with artifacts before the next begins.

## Speckit Workflow (Sequential Gates)

### Phase 1: Constitution
Command: `/speckit.constitution`
- Define project principles and constraints
- Document non-negotiable rules
- Output: constitution document

### Phase 2: Specify
Command: `/speckit.specify`
- Write formal specification for the feature
- Define user stories with acceptance criteria
- Document edge cases and error states
- Output: specification document

### Phase 3: Plan
Command: `/speckit.plan`
- Create implementation plan
- Identify affected modules and files
- Estimate complexity and dependencies
- Output: plan document

### Phase 4: Tasks
Command: `/speckit.tasks`
- Break plan into atomic, testable tasks
- Order by dependency
- Estimate each task
- Output: task list

### Phase 5: Tasks to Issues
Command: `/speckit.taskstoissues`
- Convert tasks to GitHub Issues
- Link parent/child relationships
- Assign labels and milestones
- Output: GitHub Issues created

### Phase 6: Implement
Command: `/speckit.implement`
- ONLY NOW can implementation begin
- Work through issues in dependency order
- Each issue follows the github-source-of-truth workflow

## Gate Validation
Before Phase 6, verify:
- [ ] Specification exists and has acceptance criteria
- [ ] Plan covers all specification items
- [ ] Tasks are atomic and testable
- [ ] GitHub Issues are created and linked
- [ ] Security consideration documented
- [ ] Data model changes validated (if applicable)

## Prohibited
- Writing implementation code before Phase 6
- Skipping phases (must be sequential)
- Implementing features not in specification
- Proceeding with incomplete acceptance criteria
