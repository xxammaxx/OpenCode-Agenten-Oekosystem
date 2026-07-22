---
description: "Run a real OpenCode runtime smoke check"
---

Run the extension launcher with `--phase runtime-smoke --runtime opencode --json`, then execute a real local OpenCode command only when the CLI is available and the local project configuration permits it. A registered command file alone is not runtime evidence. `$ARGUMENTS` is a sentinel or test input, never a shell fragment.
