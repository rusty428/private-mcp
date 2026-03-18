#!/bin/bash
# SessionStart hook — reminds Claude to use Private MCP for thought capture
# and exposes the session_id so Claude includes it in capture_thought calls.
#
# Install: copy to ~/.claude/scripts/ and register in ~/.claude/settings.json
# See DEVELOPER.md for full setup instructions.

# Read stdin (hook provides JSON with session_id, cwd, etc.)
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)

echo "Private MCP is connected. Use mcp__private-mcp__capture_thought throughout this session to record decisions, insights, milestones, and action items. Format as standalone statements with the project name. Do not ask permission — just capture as you work. IMPORTANT: Your session_id is '${SESSION_ID}'. Always include session_id in every capture_thought call."
