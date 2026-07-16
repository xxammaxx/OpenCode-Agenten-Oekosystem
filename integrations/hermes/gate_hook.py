"""Hermes pre_tool_call hook for runtime gate enforcement."""

import os
import json
import hashlib
from pathlib import Path

# Tool risk classification
WRITE_TOOLS = {"bash", "write_file", "edit_file", "create_file", "delete_file"}
EXTERNAL_TOOLS = {"web_fetch", "web_search", "http_request"}
DELEGATE_TOOLS = {"task", "run_agent", "background_task"}
READ_TOOLS = {"read_file", "grep", "glob", "ls", "cat"}
SAFE_TOOLS = {"ask_user", "question"}


def _find_governance_root():
    """Walk up from cwd to find .agent-governance/manifest.json."""
    cwd = Path(os.getcwd()).resolve()
    for parent in [cwd] + list(cwd.parents):
        manifest = parent / ".agent-governance" / "manifest.json"
        if manifest.exists():
            return parent
    return None


def _map_hermes_tool(tool_name, args):
    """Map Hermes tool to neutral operation descriptor."""
    action = "read"
    if tool_name in WRITE_TOOLS:
        action = "write"
    elif tool_name in EXTERNAL_TOOLS:
        action = "external"
    elif tool_name in DELEGATE_TOOLS:
        action = "delegate"

    write_paths = []
    if "path" in args:
        write_paths.append(str(args["path"]))
    elif "file_path" in args:
        write_paths.append(str(args["file_path"]))

    return {
        "runtime": "hermes",
        "tool": tool_name,
        "action": action,
        "command": args.get("command", args.get("cmd", "")),
        "writePaths": write_paths,
        "targetRoot": str(os.getcwd()),
    }


def pre_tool_call_handler(tool_name, args, session_id=None):
    """pre_tool_call hook — enforce governance before tool execution."""

    # 1. Find governance installation
    gov_root = _find_governance_root()
    if gov_root is None:
        # No governance installed — block writes, allow reads
        if tool_name in WRITE_TOOLS or tool_name in EXTERNAL_TOOLS:
            return {
                "action": "block",
                "message": "Governance not installed. Write/external operations blocked. Run /governance-install first.",
            }
        # Allow reads without governance
        return None

    # 2. Check runtime integrity (tamper detection)
    source_lock = gov_root / ".agent-governance" / "source-lock.json"
    if source_lock.exists():
        try:
            lock_data = json.loads(source_lock.read_text())
            runtime_hashes = lock_data.get("runtime_hashes", {})
            # Verify runtime files match hashes
            runtime_dir = gov_root / ".agent-governance" / "runtime"
            for filename, expected_hash in runtime_hashes.items():
                file_path = runtime_dir / filename
                if file_path.exists():
                    actual_hash = hashlib.sha256(file_path.read_bytes()).hexdigest()
                    if actual_hash != expected_hash.split(":")[-1]:
                        if tool_name in WRITE_TOOLS or tool_name in EXTERNAL_TOOLS:
                            return {
                                "action": "block",
                                "message": f"GOVERNANCE TAMPERED: Runtime file {filename} hash mismatch. All write/external operations blocked.",
                            }
        except Exception as e:
            if tool_name in WRITE_TOOLS or tool_name in EXTERNAL_TOOLS:
                return {
                    "action": "block",
                    "message": f"GOVERNANCE RUNTIME UNAVAILABLE: {str(e)}. Write/external operations blocked.",
                }

    # 3. For write and external tools, enforce gate evaluation
    if tool_name in WRITE_TOOLS or tool_name in EXTERNAL_TOOLS:
        descriptor = _map_hermes_tool(tool_name, args)

        # Check for force push / destructive git operations
        if tool_name == "bash" and args.get("command", ""):
            cmd = args.get("command", "")
            if "--force" in cmd or ("-f" in cmd and "push" in cmd):
                return {
                    "action": "block",
                    "message": "KERNEL GATE: NO_FORCE_PUSH — Force push is unconditionally blocked.",
                }
            if any(p in cmd for p in ["rm -rf", "DROP TABLE", "format"]):
                return {
                    "action": "block",
                    "message": f"KERNEL GATE: Destructive command blocked: {cmd[:80]}",
                }

        # Check write paths for escape
        for wp in descriptor.get("writePaths", []):
            wp_abs = str(Path(wp).resolve())
            gov_root_str = str(gov_root.resolve())
            if not wp_abs.startswith(gov_root_str) and not wp_abs.startswith("/tmp/"):
                return {
                    "action": "block",
                    "message": f"KERNEL GATE: NO_PATH_ESCAPE — Write path {wp} is outside governance root.",
                }

    # 4. Allow safe operations (reads, questions)
    return None


def governance_install(args, session_id=None):
    """Slash command: install governance into current project."""
    return {
        "message": "Governance installation: Run `node .agent-governance/bin/evaluate.mjs --action install` or use the canonical URL installer."
    }


def governance_status(args, session_id=None):
    """Slash command: show governance enforcement status."""
    gov_root = _find_governance_root()
    if gov_root is None:
        return {
            "message": "Governance: NOT_INSTALLED. Run /governance-install from the project root."
        }
    return {
        "message": f"Governance: INSTALLED at {gov_root}\nEnforcement Level: HOOK_ENFORCED (pre_tool_call active)\nRuntime: Hermes v0.18.2"
    }


def governance_doctor(args, session_id=None):
    """Slash command: diagnose governance installation."""
    issues = []
    gov_root = _find_governance_root()
    if gov_root is None:
        issues.append("NO_GOVERNANCE_ROOT: .agent-governance/ not found")
    else:
        manifest = gov_root / ".agent-governance" / "manifest.json"
        if not manifest.exists():
            issues.append("NO_MANIFEST: manifest.json not found")
        source_lock = gov_root / ".agent-governance" / "source-lock.json"
        if not source_lock.exists():
            issues.append("NO_SOURCE_LOCK: source-lock.json not found")
    return {"message": "\n".join(issues) if issues else "Governance: HEALTHY"}


def governance_rollback(args, session_id=None):
    """Slash command: rollback governance installation."""
    return {
        "message": "Rollback: Run `node .agent-governance/bin/evaluate.mjs --action rollback` to restore previous state."
    }
