---
name: github-source-of-truth
description: Enforces GitHub Issues as the single source of truth for all implementation work. Requires fetching the online issue, posting structured start/end comments, and documenting progress in the issue thread.
license: MIT
compatibility: opencode
metadata:
  audience: issue-orchestrator
  workflow: github
---
## Core Principle

Every unit of work MUST be traceable to a GitHub Issue. No issue, no implementation. Every task begins and ends with a structured GitHub comment.

## Workflow

### Start Gate (before any implementation)
1. `git fetch --all --prune`
2. `gh issue view <ISSUE_NUMBER> --repo <REPO> --comments --json title,body,labels,state`
3. Post Start Comment with exact format below

### Start Comment Template
```markdown
## Task Started

### Context
- Issue: #<NUMBER>
- Branch: <BRANCH>
- Current commit: <COMMIT>
- Started at: <ISO8601_TIMESTAMP>

### Understanding
- <summary of what the agent understands from the issue>

### Planned Work
- <ordered list of implementation steps>

### Tests Planned
- <list of tests to run>
```

### End Gate (before marking task complete)
1. Relevant tests executed and passing
2. `git diff --stat` reviewed
3. Post Completion Comment

### End Comment Template
```markdown
## Task Completed

### Context
- Issue: #<NUMBER>
- Branch: <BRANCH>
- Commit: <COMMIT>

### Changes
- <summary of what was implemented>

### Files Changed
- <list of changed files>

### Tests Run
- `test command` :white_check_mark:
- `test command` :x:

### Result
- <pass/fail summary>

### Blockers / Follow-ups
- <any remaining issues>
```

## Mandatory Gates
- **Start Gate:** All 3 steps must pass before implementation begins
- **End Gate:** All 4 steps must pass before task is marked complete
- **Never:** implement from local context alone without reading the online issue
- **Never:** skip the final GitHub issue comment

## Prohibited
- Implementing from memory without fetching the issue
- Skipping the comment cycle
- Modifying issues without explicit instruction
- Working on multiple issues simultaneously without completing gate cycle
