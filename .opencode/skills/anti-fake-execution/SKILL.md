---
name: anti-fake-execution
description: Prevents AI agents from inventing tool calls, test results, logs, files, issues, PRs, runtime verification, or background automation claims. Requires tool and runtime discovery before use. Enforces TOOL_GAP classification for missing capabilities. Separates structural from live verification.
license: MIT
compatibility: opencode
metadata:
  hermes: compatible
  risk_tier: all
---

# Anti-Fake Execution

## Core Principle

> No tool call, test result, log, file, issue, PR, runtime verification, or background automation may be claimed without actual execution evidence. Reality wins — the actual runtime and repository state always override memory, documentation, or hallucination.

## When To Use

This skill is **mandatory** for all risk tiers (`LOW_LOCAL`, `MEDIUM_REVIEW`, `HIGH_HUMAN_GATE`, `CRITICAL_BLOCK`). Use it **before** any claim of:

- Tool execution (MCP call, shell command, script run)
- Test pass or test failure
- Log production or log content
- File existence, file content, or file write
- Issue creation or pull request creation
- Runtime verification (`node --check`, `python -m compileall`, `docker ps`, etc.)
- Background automation or scheduled task execution
- `GREEN_SAFE` or `PASS` classification

## Prohibited Actions

The following are **always prohibited**. Violation results in the classification `RED_BLOCK` and must be reported to the user. Repeated violations lead to agent exclusion from further tasks.

| # | Prohibited Act | Example | Why |
|---|---------------|---------|-----|
| 1 | **Invented tool calls** | Claiming `node --test` ran without invoking it | Undermines all subsequent evidence |
| 2 | **Invented tests or test output** | Claiming a test is GREEN/RED without execution | Makes verification contracts meaningless |
| 3 | **Invented logs** | Writing log content that was never produced | Falsifies debugging and audit trails |
| 4 | **Invented files or file contents** | Claiming a file exists with specific content without readback | Breaks reality gate |
| 5 | **Invented issues or pull requests** | Claiming `gh issue create` succeeded without API response | Falsifies remote collaboration state |
| 6 | **Invented runtime verification** | Claiming `node --check` passed without running it | Skips actual compatibility checking |
| 7 | **Background promises without real automation** | Saying "the cleanup will run in the background" without a scheduled process | Creates false expectations |
| 8 | **`GREEN_SAFE` or `PASS` claims without evidence** | Marking a run as successful without any test/log/diff output | Circumvents completion classification gates |

## Required Before Execution

Before any of the prohibited acts would be committed, the following **must** be completed:

### 1. Tool Discovery — Verify tool exists before calling it

```bash
# Examples — actual platform-dependent commands
which node        # Linux/macOS
node --version    # Verify runtime responds
docker info       # Verify docker daemon is reachable
npx --yes <tool>  # Only after tool-gap analysis
```

If the tool is not available, classify as `TOOL_GAP`. Never simulate the tool's output.

### 2. Runtime Discovery — Verify runtime before claiming it

```bash
node --version          # Node.js
python3 --version       # Python 3
python --version        # Python 2/3
go version              # Go
rustc --version         # Rust
dotnet --version        # .NET
java -version           # Java
```

If the runtime is missing or the wrong version, document the gap. Do not claim runtime behavior without verification.

### 3. OS/Shell Detection — Detect actual platform before platform-specific operations

```bash
uname -a                # Kernel name, release, architecture
echo "$SHELL"           # Current shell path
echo "$OSTYPE"          # OS type hint (linux-gnu, darwin, msys, etc.)
$PSVersionTable         # PowerShell version (Windows)
```

Document the detected OS and shell. Do not assume Linux if the environment is macOS or Windows.

### 4. TOOL_GAP Classification — When tools are missing, classify honestly

| Scenario | Classification | Action |
|----------|---------------|--------|
| Required tool exists and works | Available | Use the tool, capture output |
| Required tool not installed | `TOOL_GAP` | Report gap, suggest installation |
| Required tool installed but wrong version | `TOOL_GAP` | Report version mismatch |
| Runtime missing entirely | `TOOL_GAP` | Block execution, report to user |
| MCP server not available | `TOOL_GAP` | Do not simulate MCP call |

Never mark a `TOOL_GAP` as verified. Never use a different tool to approximate results without explicit disclosure.

### 5. Structural vs. Live Separation — Always distinguish structural checks from live tests

| Verification Type | What It Proves | Example | Must Not Be Confused With |
|------------------|---------------|---------|---------------------------|
| **Structural** (static analysis) | Syntax validity, type correctness, configuration shape | `node --check script.js` | Actual runtime behavior |
| **Live** (dynamic execution) | Actual runtime behavior, test pass/fail, integration | `node --test` | Static code analysis |
| **Structural** | File exists, has expected size, is readable | `ls -la file`, `stat file` | File content correctness |
| **Live** | File content matches expected data | `cat file`, `sha256sum file` | File existence alone |
| **Structural** | Git index state, remote URL | `git status`, `git remote -v` | Actual commit/push result |
| **Live** | Remote operation response | `git push` output, `gh` API response | Git status alone |

**Rule:** Every live claim must be accompanied by its actual output. Every structural claim must be labeled as "structural verification only".

## Workflow

### Step 1: Run Pre-Flight
Discover available tools and runtimes. Run OS/Shell detection. Document findings in a Tool Manifest.

```markdown
## Tool Manifest
- OS: Linux 6.8.0-arch (x86_64)
- Shell: /bin/bash
- Node: v22.0.0 (available)
- Python: 3.12.0 (available)
- Docker: not found → TOOL_GAP
- Git: 2.45.0 (available)
- MCP/github: enabled (Tier 0)
- MCP/playwright: disabled (not configured)
```

### Step 2: Classify Tool Availability
For every tool or runtime required by the task, assign a classification:

- **Available** — Ready to use, capture output
- **TOOL_GAP** — Missing or wrong version, document and report

### Step 3: Before Any Claim — Verify Actual Execution Happened
Before stating any of the 8 prohibited acts as fact, confirm:

- Did the command run? Check shell history, stdout/stderr capture, or MCP response.
- Was the output captured? Include verbatim output in the evidence.
- Is the output deterministic? Rerun if necessary to confirm reproducibility.

### Step 4: For Structural-Only Claims — Mark as "Structural Verification Only"
Clearly label claims that did not involve live execution:

```
[STRUCTURAL] node --check script.js — syntax valid (structural verification only)
```

Do not imply that a structural check proves runtime correctness.

### Step 5: For Live Claims — Include Actual Output Evidence
Every live claim must include the actual captured output:

```
[LIVE] node --test test/api.test.js
→ TAP output:
ok 1 - GET /api/status returns 200
ok 2 - POST /api/status requires auth
# tests 2
# pass  2
# fail  0
```

## Verification Matrix

| Claim Type | How to Verify | Required Evidence | Classification If Missing |
|-----------|---------------|-------------------|---------------------------|
| **Tool call** | Check stdout/stderr of the actual invocation | Verbatim shell output or MCP response | `TOOL_GAP` or `RED_BLOCK` |
| **Test pass** | Include TAP, JUnit, or framework-specific output | Full test runner output with pass/fail counts | `RED_BLOCK` |
| **Test fail** | Include TAP, JUnit, or framework-specific output | Full test runner output with failing test name and error | `RED_BLOCK` |
| **File write** | Read back the file and compare checksum | `cat <file>`, `sha256sum <file>`, `ls -la <file>` | `RED_BLOCK` |
| **File content** | Use `cat`, `head`, `tail`, or `rg` to read actual contents | Verbatim content excerpt or full file dump | `RED_BLOCK` |
| **Issue creation** | Include API response from `gh issue create` or GitHub MCP | JSON response with issue number and URL | `TOOL_GAP` |
| **Pull request** | Include API response from `gh pr create` or GitHub MCP | JSON response with PR number and URL | `TOOL_GAP` |
| **Git operation** | Include `git status`, `git log`, `git diff --stat` output | Actual git command output | `RED_BLOCK` |
| **Runtime verification** | Run the actual command, capture exit code and output | `echo $?`, stdout/stderr | `TOOL_GAP` |
| **Background automation** | Show the actual process (cron job, systemd timer, CI trigger) | Process list, scheduled task config, CI workflow run URL | `RED_BLOCK` |
| **GREEN_SAFE / PASS** | Aggregate all above evidence into completion report | All evidence items present and verified | `RED_BLOCK` |

## Inputs

| Input | Description |
|-------|-------------|
| **Intended tool** | Name and path of the tool to invoke (e.g., `node`, `docker`, `gh`) |
| **Intended runtime** | Name and required version of the runtime (e.g., `Node.js >= 18`) |
| **Intended operation** | Description of what will be done (e.g., "run unit tests", "format code") |
| **Expected output** | What the correct output should look like (e.g., "TAP: all tests pass") |

## Outputs

| Output | Description |
|--------|-------------|
| **Verification status** | One of: `STRUCTURAL_ONLY` | `LIVE_VERIFIED` | `TOOL_GAP` |
| **Execution evidence** | Verbatim captured output of the actual execution (shell output, MCP response, file readback) |
| **Tool manifest** | List of all discovered tools, runtimes, and their availability classifications |
| **Gap report** | If `TOOL_GAP` occurred: what is missing, what was attempted, what is needed |

## Security Boundaries

| Boundary | Rule |
|----------|------|
| **Never fabricate evidence** | All captured output must be from actual execution. Do not construct plausible-looking output from memory. |
| **Never mark TOOL_GAP as verified** | If a tool is missing, the classification is `TOOL_GAP`. Do not downgrade to `STRUCTURAL_ONLY` or `LIVE_VERIFIED`. |
| **Never confuse structural with live** | A syntax check is not a test run. A file existence check is not a content check. Label clearly. |
| **Never simulate MCP responses** | If an MCP server is unavailable, do not fabricate its response. Report the gap. |
| **Never reuse old evidence** | Evidence from a prior session cannot be carried forward. Each session must produce fresh evidence. |
| **Never strip output context** | Include full command output. Do not cherry-pick only the passing lines while omitting errors. |

## Completion Criteria

This skill is complete when:

1. All claimed tool invocations have been verified with actual stdout/stderr output
2. All test pass/fail claims include actual TAP or framework-specific output
3. All file operations have been verified by readback and hash (where applicable)
4. All remote operations (issues, PRs, pushes) include the actual API response
5. All git operations include actual `git status`/`git log`/`git diff --stat` output
6. No `TOOL_GAP` is marked as `LIVE_VERIFIED` or `STRUCTURAL_ONLY`
7. No structural verification is presented as live verification
8. No background automation is claimed without an actual running process or scheduled task
9. No `GREEN_SAFE` or `PASS` is claimed without all above evidence being present
10. A Tool Manifest documenting all discovered tools and runtimes has been recorded

## Anti-Fake Execution Checklist

- [ ] Tools discovered before invocation
- [ ] Runtime detected before platform claims
- [ ] All test passes include actual TAP output
- [ ] All file operations verified by readback
- [ ] No background automation claimed without actual process
- [ ] TOOL_GAP marked where capabilities are missing
- [ ] Structural vs. live verification clearly separated
