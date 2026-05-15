---
name: test-enforcement
description: Enforces mandatory testing gates. No commit without tests. Verifies test execution, coverage thresholds, and regression test additions before allowing code to progress. Blocks untested changes.
license: MIT
compatibility: opencode
metadata:
  audience: review-agent
  workflow: testing
---
## Core Principle

No commit without passing tests. Every bug fix requires a regression test. Every feature requires tests covering acceptance criteria.

## Test Gates

### Pre-Commit Gate
Before ANY commit is created:
- [ ] `npm test` (or equivalent) passes with 0 failures
- [ ] No test files skipped (.skip, xit, xdescribe)
- [ ] No console.log left in test output
- [ ] Coverage did not decrease (check threshold)

### Bug Fix Gate
For every bug fix:
- [ ] Test that reproduces the bug (must fail before fix)
- [ ] Same test passes after fix
- [ ] No existing tests broken by the fix

### Feature Gate
For every new feature:
- [ ] Unit tests for all new functions/methods
- [ ] Integration test for the feature workflow
- [ ] Edge case tests (null, empty, boundary values)
- [ ] Error handling tests (network failure, invalid input)
- [ ] Acceptance criteria validated by tests

### Refactoring Gate
For refactoring (no behavior change):
- [ ] All existing tests pass without modification
- [ ] No new tests needed IF behavior unchanged
- [ ] If tests needed modification, it was NOT a pure refactoring

## Coverage Requirements

| Component Type | Minimum Coverage |
|---------------|-----------------|
| Business logic | 90% |
| API handlers | 85% |
| Database queries | 80% |
| UI components | 70% |
| Utility functions | 95% |
| Configuration | 50% |

## Test Quality Checks
- Tests must assert specific outcomes (no `expect(true).toBe(true)`)
- Tests must be deterministic (no random data without fixed seed)
- Tests must be isolated (no dependence on execution order)
- Tests must clean up after themselves
- Performance: test suite should complete in < 5 minutes

## Commands to Run
```bash
npm test                    # Full test suite
npm test -- --coverage      # With coverage report
npm run typecheck           # Type checking
npm run lint                # Linting
```

## Prohibited
- Committing code without running tests
- Disabling tests to make CI pass (fix the test or the code)
- Merging PRs with failing CI
- Using .skip without documented justification
