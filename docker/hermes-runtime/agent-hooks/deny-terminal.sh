#!/bin/sh
# pre_tool_call deny gate (ADR-025 second gate). The operations agent has no
# business in a shell; every terminal call is vetoed regardless of what the
# model decided. Hermes reads the JSON decision from stdout.
echo '{"decision": "block", "reason": "The terminal is not available to the operations agent. Use your MCP tools."}'
