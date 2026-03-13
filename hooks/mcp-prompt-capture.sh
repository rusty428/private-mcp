#!/bin/bash
# UserPromptSubmit hook — captures user prompts to Private MCP
# Reads hook JSON from stdin, extracts prompt text, sends to MCP.
#
# Install: copy to ~/.claude/scripts/ and register in ~/.claude/settings.json
# See DEVELOPER.md for full setup instructions.
#
# Required: MCP_ENDPOINT and API_KEY_ID must be set below after deployment.

# Read stdin (hook provides JSON with session_id, prompt, cwd, etc.)
INPUT=$(cat)

# Extract fields from the hook JSON
eval "$(echo "$INPUT" | python3 -c "
import sys, json, shlex
data = json.load(sys.stdin)
prompt = data.get('prompt', data.get('content', data.get('message', '')))
if isinstance(prompt, list):
    parts = [p.get('text', str(p)) for p in prompt if isinstance(p, dict)]
    prompt = ' '.join(parts) if parts else str(prompt)
print(f'PROMPT_TEXT={shlex.quote(prompt)}')
print(f'HOOK_SESSION_ID={shlex.quote(data.get(\"session_id\", \"\"))}')
" 2>/dev/null)"

# Skip empty prompts or very short ones (like just pressing enter)
if [ -z "$PROMPT_TEXT" ] || [ ${#PROMPT_TEXT} -lt 3 ]; then
  exit 0
fi

# --- CONFIGURE THESE AFTER DEPLOYMENT ---
MCP_ENDPOINT=""   # e.g. https://<api-id>.execute-api.<region>.amazonaws.com/api/mcp
API_KEY_ID=""     # API Gateway key ID from deploy output
AWS_PROFILE=""    # AWS CLI profile name
AWS_REGION=""     # e.g. us-west-2
# --- END CONFIGURATION ---

if [ -z "$MCP_ENDPOINT" ] || [ -z "$API_KEY_ID" ]; then
  exit 0  # Not configured yet
fi

# Get API key (cached for 1 hour)
CACHE_FILE="/tmp/.mcp-api-key-cache"
CACHE_MAX_AGE=3600

if [ -f "$CACHE_FILE" ] && [ $(($(date +%s) - $(stat -f %m "$CACHE_FILE"))) -lt $CACHE_MAX_AGE ]; then
  API_KEY=$(cat "$CACHE_FILE")
else
  API_KEY=$(aws apigateway get-api-key --api-key "$API_KEY_ID" --include-value \
    --profile "$AWS_PROFILE" --region "$AWS_REGION" --query 'value' --output text 2>/dev/null)
  if [ -z "$API_KEY" ] || [ "$API_KEY" = "None" ]; then
    exit 0
  fi
  echo -n "$API_KEY" > "$CACHE_FILE"
  chmod 600 "$CACHE_FILE"
fi

# Build structured capture
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PROJECT_NAME=$(basename "$PROJECT_DIR")
SESSION_ID="${HOOK_SESSION_ID:-unknown}"

# Escape for JSON
THOUGHT_JSON=$(echo -n "$PROMPT_TEXT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
PROJECT_JSON=$(echo -n "$PROJECT_NAME" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
SESSION_ID_JSON=$(echo -n "$SESSION_ID" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
SESSION_NAME_JSON=$(echo -n "" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")

# MCP initialize
curl -s -D /tmp/.mcp-headers-prompt -o /tmp/.mcp-init-prompt \
  -X POST "$MCP_ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"prompt-hook","version":"1.0"}}}' \
  2>/dev/null

SESSION_TOKEN=$(grep -i "mcp-session-id" /tmp/.mcp-headers-prompt 2>/dev/null | tr -d '\r' | awk '{print $2}')

# Call capture_thought with structured fields
curl -s -o /dev/null -X POST "$MCP_ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  ${SESSION_TOKEN:+-H "mcp-session-id: $SESSION_TOKEN"} \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"capture_thought\",\"arguments\":{\"text\":$THOUGHT_JSON,\"source\":\"user-prompt\",\"project\":$PROJECT_JSON,\"session_id\":$SESSION_ID_JSON,\"session_name\":$SESSION_NAME_JSON}}}" \
  2>/dev/null

exit 0
