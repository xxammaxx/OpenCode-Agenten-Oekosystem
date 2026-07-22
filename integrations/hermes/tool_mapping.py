# SPDX-License-Identifier: MIT
"""Tool mapping: Hermes tool names -> neutral operation descriptors.

This module is the single source of truth for classifying Hermes tools
into the runtime-neutral action model used by the canonical gate
evaluator (scripts/lib/gates/evaluate-all.mjs):

    read | write | external | delegate | safe

Descriptors produced here are consumed by ``runtime_client.evaluate()``
and by the ``pre_tool_call`` hook in ``gate_hook.py``.
"""

import os
from pathlib import Path

# ── Tool risk classification ──────────────────────────────────────

WRITE_TOOLS = {"bash", "write_file", "edit_file", "create_file", "delete_file"}
EXTERNAL_TOOLS = {"web_fetch", "web_search", "http_request"}
DELEGATE_TOOLS = {"task", "run_agent", "background_task"}
READ_TOOLS = {"read_file", "grep", "glob", "ls", "cat"}
SAFE_TOOLS = {"ask_user", "question"}

# Argument keys that may carry a filesystem write target.
_PATH_ARG_KEYS = ("path", "file_path", "filePath", "target", "destination")

# Argument keys that may carry a shell command.
_COMMAND_ARG_KEYS = ("command", "cmd", "script")


def classify_tool(tool_name):
    """Return the neutral action class for a Hermes tool name.

    Unknown tools are conservatively classified as ``write`` so that
    the gate evaluator sees them rather than silently allowing them.
    """
    if tool_name in SAFE_TOOLS:
        return "safe"
    if tool_name in READ_TOOLS:
        return "read"
    if tool_name in WRITE_TOOLS:
        return "write"
    if tool_name in EXTERNAL_TOOLS:
        return "external"
    if tool_name in DELEGATE_TOOLS:
        return "delegate"
    return "write"


def extract_write_paths(args):
    """Extract candidate write paths from Hermes tool arguments."""
    paths = []
    if not isinstance(args, dict):
        return paths
    for key in _PATH_ARG_KEYS:
        value = args.get(key)
        if value:
            paths.append(str(value))
    return paths


def extract_command(args):
    """Extract a shell command string from Hermes tool arguments."""
    if not isinstance(args, dict):
        return ""
    for key in _COMMAND_ARG_KEYS:
        value = args.get(key)
        if value:
            return str(value)
    return ""


def map_tool(tool_name, args, target_root=None):
    """Map a Hermes tool invocation to a neutral operation descriptor.

    The descriptor mirrors the parameter names of the canonical
    ``evaluateAllGates()`` entry point.
    """
    args = args if isinstance(args, dict) else {}
    return {
        "runtime": "hermes",
        "tool": tool_name,
        "action": classify_tool(tool_name),
        "command": extract_command(args),
        "writePaths": extract_write_paths(args),
        "targetRoot": str(target_root)
        if target_root
        else str(Path(os.getcwd()).resolve()),
    }


def is_enforced(tool_name):
    """True when the tool class requires gate evaluation before running."""
    return classify_tool(tool_name) in ("write", "external", "delegate")
