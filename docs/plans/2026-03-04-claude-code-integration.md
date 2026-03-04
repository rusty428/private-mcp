# AWSPrivateMCP — Claude Code Integration

## What This Is

Claude Code connected to the AWSPrivateMCP server as a native MCP tool provider, with instructions to automatically capture thoughts during every session. This makes Claude Code both a consumer and a contributor to the thought database — it can search existing thoughts for context and capture new ones as you work.

## Why It Matters

The AWSPrivateMCP server is an LLM-agnostic memory store. Without this integration, thoughts only enter the system through Slack. With it, every Claude Code session across every project becomes a capture source — decisions, people mentions, insights, milestones, and action items get stored automatically without any manual intervention.

The key insight: the value isn't in curated highlights — it's in volume. If you mention Ed 1000 times across sessions, that frequency is the signal. Any AI tool connected to the MCP server can retrieve that context, regardless of which tool originally captured it.

## Architecture

```
Claude Code session
    │
    ├── reads instructions from global MEMORY.md
    │   ("capture thoughts proactively")
    │
    ├── calls capture_thought ──▶ MCP endpoint ──▶ mcp-server Lambda
    │                                                    │
    │                                              process-thought Lambda
    │                                                │           │
    │                                                ▼           ▼
    │                                          Bedrock       Bedrock
    │                                        (Titan Embed)  (Haiku classify)
    │                                                │           │
    │                                                └─────┬─────┘
    │                                                      ▼
    │                                                 S3 Vectors
    │
    ├── calls search_thoughts ──▶ (same pipeline, read path)
    ├── calls browse_recent ────▶ (same pipeline, read path)
    └── calls stats ────────────▶ (same pipeline, read path)
```

No new infrastructure was created. The existing MCP server, Lambdas, and S3 Vectors handle everything. The only changes were:

1. Registering the MCP server in Claude Code's configuration
2. Adding capture instructions to Claude Code's global memory

## How to Reproduce

### Prerequisites

- AWSPrivateMCP stack deployed (see `2026-03-04-aws-private-mcp-implementation.md`)
- Claude Code installed
- AWS CLI configured with `private-mcp` profile

### Step 1: Register the MCP Server

```bash
# Fetch the API key value (never hardcode it)
API_KEY=$(aws apigateway get-api-key --api-key fe5nyv6n00 --include-value \
  --profile private-mcp --region us-west-2 --query 'value' --output text)

# Register as an HTTP MCP server in Claude Code
claude mcp add --transport http aws-private-mcp \
  "https://zjyd52hk73.execute-api.us-west-2.amazonaws.com/api/mcp" \
  --header "x-api-key: $API_KEY"
```

This writes to `.claude.json` at the project level. If run from `~/projects/`, the MCP server is available to all projects under that directory.

Restart Claude Code after adding.

### Step 2: Verify the Connection

Start a new Claude Code session and test:

```
> how many thoughts do I have?
```

Claude should call the `stats` MCP tool directly (not curl) and return the count.

### Step 3: Add Auto-Capture Instructions

Add the following to Claude Code's global memory file (the MEMORY.md that persists across conversations for the project scope):

```markdown
## AWSPrivateMCP Auto-Capture (FOLLOW THIS)
When the `aws-private-mcp` MCP server is connected, capture thoughts throughout the session using `capture_thought`. Capture:
- **Decisions made** — architectural choices, tool selections, approach changes
- **People mentioned** — anything said about or involving a specific person
- **Insights and discoveries** — bugs found, patterns recognized, "aha" moments
- **Project milestones** — deployments, features completed, problems solved
- **Action items** — things deferred for later, follow-ups needed

Format each capture as a clear, standalone statement that will make sense to any AI reading it later with zero context. Include project name and relevant people. Don't capture routine tool output (file reads, command results, git operations).

Don't ask permission before capturing — just do it. If in doubt, capture it.
```

### Step 4: Verify Auto-Capture

In the next session, work normally. Check `stats` periodically to confirm new thoughts are being captured. Claude should be calling `capture_thought` without being asked.

## What Gets Captured

| Category | Example |
|---|---|
| Decisions | "Badgerfy: decided to use Cognito with separate pools for web and admin" |
| People | "Ed reviewed the PR and flagged the auth token expiry issue" |
| Insights | "AWSPrivateMCP: S3 Vectors rejects empty arrays in metadata — must filter before PutVectors" |
| Milestones | "Badgerfy: admin publisher pipeline deployed and working, cross-account to badgerfy S3/CloudFront" |
| Action items | "AWSPrivateMCP: need to add deduplication for Slack 3-second retry issue" |

## What Does NOT Get Captured

- File contents, command output, git operations
- Routine back-and-forth ("read this file", "run that command")
- Anything that's just tool noise

## Design Decisions

### Why instructions instead of hooks?

Claude Code hooks fire on events (tool calls, stop, etc.) but don't have access to conversation content. A hook could trigger a capture, but it wouldn't know *what* to capture. The AI itself has the context — it knows what's a decision vs. noise. Instructions in MEMORY.md let the AI use judgment.

Trade-off: this relies on the AI following instructions, which isn't guaranteed across models or if context gets compressed. If reliability is a problem in practice, we'll explore hooks or a hybrid approach.

### Why capture everything instead of curating?

The classification layer (Haiku) already handles organization — it extracts type, topics, people, action items. Retrieval quality comes from the embedding + metadata filtering, not from limiting what goes in. More data means richer patterns over time.

### Why lowercase topic normalization?

The Haiku classifier was inconsistently casing topics ("AWS" vs "aws"), which split counts in stats and could affect topic-based filtering. Fixed with:
1. Prompt instruction: "always lowercase" in the classification system prompt
2. Code safety net: `.toLowerCase()` on topics after parsing in `classifyThought.ts`

## Scope and Configuration

| Setting | Value |
|---|---|
| MCP server name | `aws-private-mcp` |
| Endpoint | `https://zjyd52hk73.execute-api.us-west-2.amazonaws.com/api/mcp` |
| Auth | API Gateway API key (`x-api-key` header) |
| API Key ID | `fe5nyv6n00` |
| Config scope | `~/projects/` (all sub-projects) |
| Instruction scope | Global MEMORY.md (all conversations in scope) |
| Tools available | `stats`, `browse_recent`, `search_thoughts`, `capture_thought` |

## Future Considerations

- **Reliability monitoring**: Track whether auto-capture actually fires consistently across sessions
- **Hook hybrid**: If instruction-based capture proves unreliable, explore a `Stop` hook that summarizes the session
- **Cross-tool capture**: Same MCP server can be connected to Claude Desktop, ChatGPT, or any MCP-compatible client
- **Deduplication**: The Slack 3-second retry duplicate issue also applies if Claude captures the same thought twice in quick succession
