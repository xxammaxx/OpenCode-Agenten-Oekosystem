# opencode-canonical-method

This preset overrides Spec Kit command prompts; it does not copy or replace
the kernel. The source of truth remains `WORKING-METHOD.md`. A synchronization
check compares the required terminology and gate markers in this preset with
the canonical method and fails if required markers disappear.

The preset is local-development-only until packaged and independently
reviewed. It is pinned to Spec Kit 0.13.x.
