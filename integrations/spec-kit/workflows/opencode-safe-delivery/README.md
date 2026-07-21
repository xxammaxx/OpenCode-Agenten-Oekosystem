# opencode-safe-delivery

This workflow is a Spec Kit orchestration layer. It uses static shell steps to
invoke the argv-only extension launcher; the shell step itself is not a
security boundary because Spec Kit 0.13.x executes shell steps with a shell.
The canonical bridge and runtime-neutral kernel remain authoritative.

State is persisted by Spec Kit under `.specify/workflows/runs/`. Resume must
re-run the current gate/preflight and must not be treated as approval receipt
consumption. Approval receipts are validated by the kernel bridge when an
approval file is supplied.

Remote CI, push, PR, merge, release, and deployment are not workflow steps.
