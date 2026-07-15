---
name: remote-ci-approval-gate
description: Prevents remote CI workflows from being copied or enabled without explicit opt-in. Enforces local-first validation, cost/secret/permission analysis, and concrete workflow file listing.
license: MIT
compatibility: opencode
metadata:
  audience: bootstrap
  workflow: ci
  hermes: compatible
---

## When To Use

Use this skill when any GitHub Actions or other remote CI workflow is under consideration.

## Core Principles

1. **Local tests first** — Remote CI is supplementary to local validation, never a replacement.
2. **Remote CI is disabled by default** — No CI workflow is activated without `--include-remote-ci`.
3. **Private repositories without owner approval = `RED_BLOCK`** — Remote CI for private repos always requires explicit owner approval.
4. **Cost, secret, and permission analysis before activation** — Every workflow must be analyzed for: resource consumption, secret exposure, and required permissions.
5. **List concrete workflow files** — Never copy `.github/workflows/*` blindly. Each file must be named and justified.
6. **Never claim remote CI is required** — If local gates (tests, review, validation) are sufficient, remote CI is optional.

## Workflow

1. Detect workflow files in `.github/workflows/`.
2. List each file explicitly with its purpose.
3. Perform cost/secret/permission analysis for each workflow:
   - Which GitHub Actions are used? Are they pinned?
   - Which secrets are exposed to the workflow?
   - What permissions does the workflow require?
   - Does the workflow consume billable minutes?
4. Check if the target repository is private:
   - If private and no owner approval → classification `RED_BLOCK`
   - Document the block and request explicit owner approval
5. Require the `--include-remote-ci` opt-in flag before proposing installation.
6. Keep workflows disabled by default. Never activate them automatically.
7. Document the rationale: why each workflow is or is not included.
8. If local gates are sufficient, state that remote CI is optional and not required.

## Inputs

- `.github/workflows` contents (if they exist)
- repository visibility (public/private)
- opt-in flag (`--include-remote-ci`)
- target project policy
- cost/secret/permission analysis results

## Outputs

- workflow proposal list (with per-file justification)
- cost/secret/permission analysis report
- explanation of why each workflow is or is not included
- classification note if private repo blocks activation
- statement on whether local gates are sufficient without remote CI

## Security Boundaries

- no automatic CI enablement
- no secret assumption
- no releases or package publishing
- no claiming remote CI is required if local gates suffice
- no blind copying of workflow directories

## Completion Criteria

- every workflow is explicitly named with purpose
- cost/secret/permission analysis is documented
- the opt-in requirement is clear
- no CI is silently copied
- local test sufficiency is evaluated and documented
- private repo status is checked and documented
