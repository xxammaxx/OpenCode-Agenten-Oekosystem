"""Python installer bridge for the Hermes plugin installation workflow.

Wraps the repository's Node.js bootstrap installer
(``scripts/bootstrap-project.mjs``) so the ``/governance-install`` and
``/governance-rollback`` flows can be driven from Hermes.

Safety model (mirrors BOOTSTRAP.md):
- Dry-run is ALWAYS the default. ``apply=True`` must be explicit.
- Rollback is available via the printed backup manifest.
- No secrets are read, written, or logged.
- Missing tooling yields ``TOOL_GAP`` — never an implicit success.
"""

import os
import shutil
import subprocess
from pathlib import Path

DEFAULT_TIMEOUT_SECONDS = 120

RESULT_GREEN = "GREEN_SAFE"
RESULT_AMBER = "AMBER_REVIEW"
RESULT_RED = "RED_BLOCK"
RESULT_TOOL_GAP = "TOOL_GAP"


def _plugin_repo_root():
    """Root of the installed plugin repository (two levels up)."""
    return Path(__file__).resolve().parents[2]


def _bootstrap_script():
    return _plugin_repo_root() / "scripts" / "bootstrap-project.mjs"


def _result(status, message, stdout="", stderr="", exit_code=None):
    return {
        "status": status,
        "message": message,
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": exit_code,
    }


def preflight(target=None):
    """Check that installation prerequisites are met.

    Returns a result dict; ``status`` is ``GREEN_SAFE`` when the
    installer can run, otherwise ``TOOL_GAP`` or ``RED_BLOCK``.
    """
    node = shutil.which("node")
    if node is None:
        return _result(
            RESULT_TOOL_GAP,
            "TOOL_GAP: Node.js not found on PATH. Install Node.js >= 18 first.",
        )

    script = _bootstrap_script()
    if not script.exists():
        return _result(
            RESULT_TOOL_GAP, f"TOOL_GAP: bootstrap script not found at {script}."
        )

    target_path = Path(target or os.getcwd()).resolve()
    if not target_path.is_dir():
        return _result(
            RESULT_RED, f"RED_BLOCK: target directory does not exist: {target_path}"
        )

    return _result(RESULT_GREEN, f"Preflight OK. Target: {target_path}")


def _run_bootstrap(extra_args, target, timeout):
    node = shutil.which("node")
    script = _bootstrap_script()
    target_path = Path(target or os.getcwd()).resolve()

    cmd = [node, str(script), "--target", str(target_path)] + list(extra_args)
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(_plugin_repo_root()),
        )
    except subprocess.TimeoutExpired:
        return _result(
            RESULT_TOOL_GAP, f"TOOL_GAP: bootstrap timed out after {timeout}s."
        )
    except OSError as exc:
        return _result(RESULT_TOOL_GAP, f"TOOL_GAP: failed to spawn bootstrap: {exc}")

    if proc.returncode == 0:
        status, message = RESULT_GREEN, "Bootstrap completed."
    elif proc.returncode == 2:
        status, message = (
            RESULT_RED,
            "Bootstrap blocked (RED_BLOCK). Review output before retrying.",
        )
    else:
        status, message = (
            RESULT_AMBER,
            f"Bootstrap exited with code {proc.returncode}. Review output.",
        )

    return _result(
        status,
        message,
        stdout=proc.stdout,
        stderr=proc.stderr,
        exit_code=proc.returncode,
    )


def install(
    target=None, apply=False, include_remote_ci=False, timeout=DEFAULT_TIMEOUT_SECONDS
):
    """Run the governance bootstrap against ``target``.

    ``apply=False`` (default) performs a dry-run only. Remote CI
    proposals are opt-in via ``include_remote_ci``.
    """
    check = preflight(target)
    if check["status"] != RESULT_GREEN:
        return check

    extra = []
    if apply:
        extra.append("--apply")
    if include_remote_ci:
        extra.append("--include-remote-ci")

    result = _run_bootstrap(extra, target, timeout)
    if not apply and result["status"] == RESULT_GREEN:
        result["message"] = (
            "Dry-run completed. Review the plan, then re-run with apply=True to write files."
        )
    return result


def rollback(backup_dir, target=None, timeout=DEFAULT_TIMEOUT_SECONDS):
    """Rollback a previous apply run from its backup directory."""
    check = preflight(target)
    if check["status"] != RESULT_GREEN:
        return check

    backup_path = Path(backup_dir).resolve()
    if not backup_path.is_dir():
        return _result(
            RESULT_RED, f"RED_BLOCK: backup directory not found: {backup_path}"
        )

    return _run_bootstrap(["--rollback", str(backup_path)], target, timeout)
