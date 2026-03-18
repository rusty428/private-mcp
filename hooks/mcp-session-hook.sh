#!/bin/bash
# SessionEnd hook — captures session activity to Private MCP
# Checks for a session summary JSON first (rich content), falls back to basic ping.
#
# Install: copy to ~/.claude/scripts/ and register in ~/.claude/settings.json
# See DEVELOPER.md for full setup instructions.
#
# Required: MCP_ENDPOINT and API_KEY_ID must be set below after deployment.

# Read stdin (hook provides JSON with session_id, cwd, etc.)
INPUT=$(cat)
eval "$(echo "$INPUT" | python3 -c "
import sys, json, shlex
data = json.load(sys.stdin)
print(f'HOOK_SESSION_ID={shlex.quote(data.get(\"session_id\", \"\"))}')
" 2>/dev/null)"

# --- CONFIGURE THESE AFTER DEPLOYMENT ---
MCP_ENDPOINT=""   # e.g. https://<api-id>.execute-api.<region>.amazonaws.com/api/mcp
API_KEY_ID=""     # API Gateway key ID from deploy output
AWS_PROFILE=""    # AWS CLI profile name
AWS_REGION=""     # e.g. us-west-2
# --- END CONFIGURATION ---

if [ -z "$MCP_ENDPOINT" ] || [ -z "$API_KEY_ID" ]; then
  exit 0  # Not configured yet
fi

# Get API key (cached for 1 hour to avoid slow calls)
CACHE_FILE="/tmp/.mcp-api-key-cache"
CACHE_MAX_AGE=3600

# Check cache (stat -f %m is macOS, stat -c %Y is Linux)
if [ -f "$CACHE_FILE" ]; then
  if [ "$(uname)" = "Darwin" ]; then
    CACHE_MTIME=$(stat -f %m "$CACHE_FILE")
  else
    CACHE_MTIME=$(stat -c %Y "$CACHE_FILE")
  fi
  if [ $(($(date +%s) - CACHE_MTIME)) -lt $CACHE_MAX_AGE ]; then
    API_KEY=$(cat "$CACHE_FILE")
  fi
fi

if [ -z "$API_KEY" ]; then
  API_KEY=$(aws apigateway get-api-key --api-key "$API_KEY_ID" --include-value \
    --profile "$AWS_PROFILE" --region "$AWS_REGION" --query 'value' --output text 2>/dev/null)
  if [ -z "$API_KEY" ] || [ "$API_KEY" = "None" ]; then
    exit 0  # Silently fail if AWS auth is expired
  fi
  echo -n "$API_KEY" > "$CACHE_FILE"
  chmod 600 "$CACHE_FILE"
fi

# Gather session context
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PROJECT_NAME=$(basename "$PROJECT_DIR")
GIT_BRANCH=$(cd "$PROJECT_DIR" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "none")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSION_ID="${HOOK_SESSION_ID:-unknown}"

# Look for a session summary JSON written in the last 10 minutes
SUMMARY_FILE=""
for search_dir in \
  "$PROJECT_DIR/docs/working/summaries" \
  "$PROJECT_DIR/projectDocs/working/summaries" \
  "$PROJECT_DIR/../docs/working/summaries"; do
  if [ -d "$search_dir" ]; then
    CANDIDATE=$(find "$search_dir" -name "*.json" -newer /dev/null -mmin -10 -type f 2>/dev/null | sort -r | head -1)
    if [ -n "$CANDIDATE" ]; then
      SUMMARY_FILE="$CANDIDATE"
      break
    fi
  fi
done

# Build thought text from summary or fallback to basic ping
if [ -n "$SUMMARY_FILE" ]; then
  THOUGHT=$(python3 -c "
import json, sys
with open('$SUMMARY_FILE') as f:
    s = json.load(f)
parts = []
sess = s.get('session', {})
parts.append(f\"Session: {sess.get('task', 'unknown')} [{sess.get('status', 'unknown')}]\")
state = s.get('state', {})
if state.get('problem'):
    parts.append(f\"Problem: {state['problem']}\")
if state.get('approach'):
    parts.append(f\"Approach: {state['approach']}\")
decisions = s.get('decisions', [])
if decisions:
    parts.append('Decisions: ' + '; '.join(decisions))
nexts = state.get('next_steps', [])
if nexts:
    parts.append('Next: ' + '; '.join(nexts))
changes = s.get('code_changes', {})
created = changes.get('created', [])
modified = changes.get('modified', [])
if created or modified:
    parts.append(f\"Changed {len(modified)} files, created {len(created)} files\")
parts.append(f\"Project: {sess.get('date', 'unknown')} {PROJECT_NAME} (branch: $GIT_BRANCH)\")
print(' | '.join(parts))
" 2>/dev/null)
  SOURCE="session-summary"
else
  THOUGHT="Session ended: ${PROJECT_NAME} (branch: ${GIT_BRANCH}) at ${TIMESTAMP}. Session ID: ${SESSION_ID}"
  SOURCE="session-hook"
fi

# Escape fields for JSON
THOUGHT_JSON=$(echo -n "$THOUGHT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
PROJECT_JSON=$(echo -n "$PROJECT_NAME" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
SESSION_ID_JSON=$(echo -n "$SESSION_ID" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
SESSION_NAME_JSON=$(echo -n "" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")

# MCP requires initialize first
curl -s -D /tmp/.mcp-headers -o /tmp/.mcp-init \
  -X POST "$MCP_ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"session-hook","version":"1.0"}}}' \
  2>/dev/null

SESSION_TOKEN=$(grep -i "mcp-session-id" /tmp/.mcp-headers 2>/dev/null | tr -d '\r' | awk '{print $2}')

# Call capture_thought with structured fields
curl -s -o /dev/null -X POST "$MCP_ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  ${SESSION_TOKEN:+-H "mcp-session-id: $SESSION_TOKEN"} \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"capture_thought\",\"arguments\":{\"text\":$THOUGHT_JSON,\"source\":\"$SOURCE\",\"project\":$PROJECT_JSON,\"session_id\":$SESSION_ID_JSON,\"session_name\":$SESSION_NAME_JSON}}}" \
  2>/dev/null

exit 0
