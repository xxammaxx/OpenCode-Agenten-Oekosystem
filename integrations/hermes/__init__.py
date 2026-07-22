# SPDX-License-Identifier: MIT
"""Hermes integration package for the canonical agent governance plugin."""

from .gate_hook import pre_tool_call_handler


def register(ctx):
    """Register the pre_tool_call governance hook with Hermes.

    Called by Hermes's plugin loader at startup. Registers the
    pre_tool_call_handler so that every tool call is intercepted
    and validated through the canonical gate evaluator before execution.
    """
    ctx.register_hook("pre_tool_call", pre_tool_call_handler)
