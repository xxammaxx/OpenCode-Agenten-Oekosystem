# SPDX-License-Identifier: MIT
"""Client for the Node.js canonical gate evaluator.

Bridges Python (Hermes hooks and slash commands) to the canonical gate
evaluation entry point ``scripts/lib/gates/evaluate-all.mjs`` via its
resident CLI wrapper ``.agent-governance/bin/evaluate.mjs`` or the
plugin-repo fallback ``scripts/evaluate-gates.mjs`` using ``subprocess``.

Exit code contract of the CLI:
    0 = GREEN_SAFE
    1 = AMBER_REVIEW or TOOL_GAP
    2 = RED_BLOCK

Design invariants honored here:
- Evaluator failure NEVER results in an implicit allow. Any subprocess
  or parse error yields a blocking ``TOOL_GAP`` decision.
- No secrets are read, passed, or logged.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

DEFAULT_TIMEOUT_SECONDS = 30

_EXIT_CLASSIFICATION = {
    0: "GREEN_SAFE",
    1: "AMBER_REVIEW",
    2: "RED_BLOCK",
}

# Neutral descriptor action -> evaluator action vocabulary
# (see `node scripts/evaluate-gates.mjs --help` for valid actions).
_ACTION_MAP = {
    "read": "evaluate",
    "safe": "evaluate",
    "write": "apply",
    "external": "evaluate",
    "delegate": "evaluate",
}


def _plugin_repo_root():
    """Root of the installed plugin repository (two levels up)."""
    return Path(__file__).resolve().parents[2]


def find_evaluator(governance_root=None):
    """Locate the gate evaluator CLI script.

    Search order:
    1. ``<governance_root>/.agent-governance/bin/evaluate.mjs``
       (project-local installed resident CLI)
    2. ``<governance_root>/.agent-governance/runtime/gates/evaluate-all.mjs``
       (project-local installed runtime — direct import by node)
    3. ``<plugin repo>/scripts/evaluate-gates.mjs``
       (the Hermes plugin checkout itself — fallback only)

    Returns a ``Path`` or ``None`` when no evaluator is available.
    """
    candidates = []
    if governance_root:
        candidates.append(
            Path(governance_root) / ".agent-governance" / "bin" / "evaluate.mjs"
        )
        candidates.append(
            Path(governance_root)
            / ".agent-governance"
            / "runtime"
            / "gates"
            / "evaluate-all.mjs"
        )
    # Plugin repo fallback (only when no project-local runtime is installed)
    candidates.append(_plugin_repo_root() / "scripts" / "evaluate-gates.mjs")

    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()
    return None


def _tool_gap(message):
    """Blocking decision used whenever live evaluation is impossible."""
    return {
        "classification": "TOOL_GAP",
        "allowed": False,
        "exitCode": 1,
        "verificationLevel": "TOOL_GAP",
        "warnings": [message],
        "raw": None,
    }


def evaluate(descriptor, governance_root=None, timeout=DEFAULT_TIMEOUT_SECONDS):
    """Evaluate a neutral operation descriptor against all gates.

    ``descriptor`` is the output of ``tool_mapping.map_tool()``.
    Returns a decision dict with at least ``classification``,
    ``allowed``, ``exitCode``, and ``warnings`` keys.
    """
    node = shutil.which("node")
    if node is None:
        return _tool_gap(
            "TOOL_GAP: Node.js runtime not found on PATH. Gate evaluation unavailable."
        )

    evaluator = find_evaluator(governance_root)
    if evaluator is None:
        return _tool_gap(
            "TOOL_GAP: evaluate-gates.mjs not found in governance runtime or plugin checkout."
        )

    target = descriptor.get("targetRoot") or os.getcwd()
    neutral_action = str(descriptor.get("action", "read"))
    evaluator_action = _ACTION_MAP.get(neutral_action, "evaluate")
    cmd = [
        node,
        str(evaluator),
        "--target",
        str(target),
        "--runtime",
        "hermes",
        "--action",
        evaluator_action,
        "--json",
    ]
    command = descriptor.get("command")
    if command:
        cmd.extend(["--command", str(command)])
    for write_path in descriptor.get("writePaths", []) or []:
        cmd.extend(["--write-path", str(write_path)])

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(target),
        )
    except subprocess.TimeoutExpired:
        return _tool_gap(f"TOOL_GAP: Gate evaluator timed out after {timeout}s.")
    except OSError as exc:
        return _tool_gap(f"TOOL_GAP: Failed to spawn gate evaluator: {exc}")

    raw = None
    try:
        raw = json.loads(proc.stdout) if proc.stdout.strip() else None
    except (json.JSONDecodeError, ValueError):
        raw = None

    classification = _EXIT_CLASSIFICATION.get(proc.returncode)
    if classification is None:
        return _tool_gap(
            f"TOOL_GAP: Gate evaluator exited with unexpected code {proc.returncode}."
        )

    if isinstance(raw, dict) and raw.get("classification"):
        classification = raw["classification"]

    return {
        "classification": classification,
        "allowed": proc.returncode == 0,
        "exitCode": proc.returncode,
        "verificationLevel": (raw or {}).get("verificationLevel", "STRUCTURAL_PASS"),
        "warnings": (raw or {}).get("warnings", []),
        "blockedBy": (raw or {}).get("blockedBy", []),
        "raw": raw,
    }


def block_message(decision):
    """Build a human-readable block message from a gate decision."""
    parts = [f"GATE {decision.get('classification', 'UNKNOWN')}"]
    for blocked in decision.get("blockedBy", []) or []:
        code = blocked.get("code") or blocked.get("gateId") or "GATE"
        msg = blocked.get("message", "")
        parts.append(f"{code}: {msg}".strip())
    for warning in decision.get("warnings", []) or []:
        parts.append(str(warning))
    return "\n".join(parts)
