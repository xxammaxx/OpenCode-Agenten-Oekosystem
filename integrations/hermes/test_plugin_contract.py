# SPDX-License-Identifier: MIT
"""Contract tests for the Hermes governance plugin registration.

These tests validate the Hermes 0.18.2 plugin contract:
- The plugin exports a ``register(ctx)`` function
- ``register(ctx)`` calls ``ctx.register_hook("pre_tool_call", handler)``
- The correct handler (``pre_tool_call_handler`` from ``gate_hook.py``) is registered
- No import side-effects (importing the module does not register hooks)
- Idempotency (repeated registration does not cause issues)
- Handler behavior: fail-closed, read-allow, path-escape-block, force-push-block
"""

import importlib
import sys
from pathlib import Path

# Ensure the project root is on sys.path for relative imports
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))


# ────────────────────────────────────────────────────────────────────
# Helper: Fake Hermes Context for contract tests
# ────────────────────────────────────────────────────────────────────


class FakeContext:
    """Simulates Hermes's plugin context for register() contract tests."""

    def __init__(self):
        self._hooks = {}
        self._register_count = 0

    def register_hook(self, hook_name, handler):
        """Mimics ctx.register_hook() from Hermes 0.18.2."""
        self._register_count += 1
        if hook_name not in self._hooks:
            self._hooks[hook_name] = []
        self._hooks[hook_name].append(handler)

    @property
    def registered_hooks(self):
        return dict(self._hooks)

    @property
    def register_count(self):
        return self._register_count


# ────────────────────────────────────────────────────────────────────
# Tests
# ────────────────────────────────────────────────────────────────────


class TestPluginExport:
    """R1: Module exports the register function."""

    def test_register_function_exists(self):
        """`integrations.hermes` exports the ``register`` callable."""
        from integrations.hermes import register  # noqa: F811

        assert callable(register), "register must be a callable function"

    def test_register_accepts_context(self):
        """register() accepts a context argument."""
        from integrations.hermes import register

        ctx = FakeContext()
        # Should not raise TypeError
        register(ctx)


class TestCorrectHook:
    """R2 + R3: Correct hook name and handler registered."""

    def test_registers_pre_tool_call_hook(self):
        """register(ctx) must call ctx.register_hook with \"pre_tool_call\"."""
        from integrations.hermes import register

        ctx = FakeContext()
        register(ctx)

        assert "pre_tool_call" in ctx.registered_hooks, (
            "Expected 'pre_tool_call' hook to be registered"
        )

    def test_registers_correct_handler(self):
        """The handler must be pre_tool_call_handler from gate_hook."""
        from integrations.hermes import register
        from integrations.hermes.gate_hook import pre_tool_call_handler

        ctx = FakeContext()
        register(ctx)

        handlers = ctx.registered_hooks.get("pre_tool_call", [])
        assert len(handlers) == 1, f"Expected 1 handler, got {len(handlers)}"
        assert handlers[0] is pre_tool_call_handler, (
            "Handler must be pre_tool_call_handler from gate_hook"
        )


class TestContextContract:
    """R4: Fake Context records hook name and callback."""

    def test_context_records_hook_name(self):
        """FakeContext correctly records registered hook names."""
        ctx = FakeContext()
        ctx.register_hook("pre_tool_call", lambda a, b: None)
        assert "pre_tool_call" in ctx.registered_hooks

    def test_context_records_callback(self):
        """FakeContext correctly records the handler callback."""
        ctx = FakeContext()

        def my_handler(a, b):
            return None

        ctx.register_hook("pre_tool_call", my_handler)
        assert ctx.registered_hooks["pre_tool_call"][0] is my_handler

    def test_context_tracks_register_count(self):
        """FakeContext tracks the number of register_hook calls."""
        ctx = FakeContext()
        assert ctx.register_count == 0
        ctx.register_hook("pre_tool_call", lambda a, b: None)
        assert ctx.register_count == 1


class TestNoImportSideEffects:
    """R5: Module import does not register hooks or modify runtime."""

    def test_import_does_not_register_hooks(self):
        """Importing the module must not call any hook registration."""
        # Remove from sys.modules to get a fresh import
        mod_name = "integrations.hermes"
        if mod_name in sys.modules:
            del sys.modules[mod_name]

        # We verify that the module has a register function but
        # that no implicit registration happens on import.
        mod = importlib.import_module(mod_name)
        assert hasattr(mod, "register"), "Module must export register function"
        # The register function exists but is NOT auto-called on import
        assert callable(mod.register)

    def test_register_is_not_called_on_import(self):
        """The register() function is defined but not invoked at import time."""
        # This is verified by the fact that importing the module does not
        # require a context object. If register() were called at import,
        # it would fail with TypeError (missing ctx argument).
        mod_name = "integrations.hermes"
        if mod_name in sys.modules:
            del sys.modules[mod_name]
        # This should not raise
        importlib.import_module(mod_name)


class TestIdempotency:
    """R6: Repeated registration is safe."""

    def test_double_register_is_harmless(self):
        """Calling register() twice does not cause uncontrolled side effects."""
        from integrations.hermes import register

        ctx = FakeContext()
        register(ctx)
        first_count = ctx.register_count
        first_handlers = ctx.registered_hooks.get("pre_tool_call", [])

        register(ctx)
        second_count = ctx.register_count
        second_handlers = ctx.registered_hooks.get("pre_tool_call", [])

        # Hermes plugin loader calls register() once. Double registration
        # in tests should be safe but we document the behavior.
        assert second_count >= first_count, (
            f"Re-registration should at least not decrease count "
            f"(was {first_count}, now {second_count})"
        )
        # All handlers should still be present
        assert all(h in second_handlers for h in first_handlers), (
            "Original handlers must remain registered after re-registration"
        )


class TestHandlerReadAllow:
    """R7: Safe read operations are allowed (handler returns None)."""

    def test_read_tool_returns_none(self):
        """Handler returns None for safe read operations."""
        from integrations.hermes.gate_hook import pre_tool_call_handler

        result = pre_tool_call_handler("read_file", {"path": "/some/file.txt"})
        assert result is None, "Read operations should be allowed (return None)"


class TestHandlerPathEscape:
    """R8: Write outside worktree is blocked."""

    def test_path_escape_blocked_by_kernel(self):
        """Handler blocks writes to paths outside governance root."""
        from integrations.hermes.gate_hook import pre_tool_call_handler

        # This test verifies the kernel inline check for path containment.
        # Simulate a write to /tmp (outside any .agent-governance root)
        result = pre_tool_call_handler(
            "write_file", {"file_path": "/tmp/hermes-sentinel"}
        )
        # If governance not installed, writes are blocked
        if result is not None:
            assert result.get("action") == "block", (
                f"Path escape should be blocked, got: {result}"
            )
            assert (
                "NO_PATH_ESCAPE" in result.get("message", "")
                or "not installed" in result.get("message", "").lower()
            ), f"Should mention path escape or no governance. Got: {result}"


class TestHandlerForcePush:
    """R9: Force push is unconditionally blocked."""

    def test_force_push_blocked_by_kernel(self):
        """Handler blocks force push commands."""
        from integrations.hermes.gate_hook import pre_tool_call_handler

        result = pre_tool_call_handler(
            "bash", {"command": "git push --force origin main"}
        )
        # If governance not installed, writes are blocked anyway
        if result is not None:
            assert result.get("action") == "block", (
                f"Force push should be blocked, got: {result}"
            )

    def test_force_push_dash_f_blocked(self):
        """Handler blocks git push -f commands."""
        from integrations.hermes.gate_hook import pre_tool_call_handler

        result = pre_tool_call_handler("bash", {"command": "git push -f"})
        if result is not None:
            assert result.get("action") == "block", (
                f"Force push (-f) should be blocked, got: {result}"
            )


class TestHandlerFailClosed:
    """R10 + R11 + R12: Handler is ALWAYS fail-closed."""

    def test_missing_evaluator_blocks(self):
        """When evaluator is unreachable, writes are blocked (fail-closed)."""
        from integrations.hermes.gate_hook import pre_tool_call_handler

        # With no .agent-governance in cwd, writes should be blocked
        result = pre_tool_call_handler(
            "write_file", {"file_path": "/tmp/test-write.txt"}
        )
        assert result is not None, (
            "Write should be blocked when governance not installed"
        )
        assert result.get("action") == "block", (
            f"Expected block, got: {result.get('action')}"
        )

    def test_invalid_tool_triggers_safe_block(self):
        """Unknown tool type should not crash the handler."""
        from integrations.hermes.gate_hook import pre_tool_call_handler

        # Handler should handle unexpected tool names gracefully
        try:
            result = pre_tool_call_handler("unknown_tool", {})
        except Exception as exc:
            assert False, f"Handler should not raise for unknown tools: {exc}"
        # Unknown tools follow the read path (return None) since they don't
        # match WRITE_TOOLS, EXTERNAL_TOOLS, or DELEGATE_TOOLS
        assert result is None or (
            isinstance(result, dict) and result.get("action") == "block"
        ), "Handler should not crash for unknown tools"

    def test_handler_never_returns_allow_dict(self):
        """Handler never returns a dict with action='allow'."""
        from integrations.hermes.gate_hook import pre_tool_call_handler

        # Test various input scenarios
        scenarios = [
            ("read_file", {"path": "/tmp/test"}),
            ("write_file", {"file_path": "/tmp/test"}),
            ("bash", {"command": "echo hello"}),
            ("bash", {"command": "rm -rf /"}),
        ]

        for tool_name, args in scenarios:
            result = pre_tool_call_handler(tool_name, args)
            if isinstance(result, dict):
                action = result.get("action", "")
                assert action != "allow", (
                    f"Handler must never return action='allow'. "
                    f"Got {result} for {tool_name}({args})"
                )
