# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Private MCP is a private MCP server on AWS for personal thought capture and semantic retrieval. Type a thought in Slack or any MCP-connected AI tool — it gets embedded, classified, and stored in S3 Vectors. Any AI tool can search your thoughts by meaning.

All data stays within a dedicated AWS account. No third-party API routing.

## Commands

Package manager is **pnpm**. All commands run from the repo root.

```bash
pnpm install           # Install dependencies
pnpm build             # TypeScript compile (tsc)
pnpm synth             # Generate CloudFormation templates (cdk synth)
pnpm diff              # Preview infrastructure changes (cdk diff)
pnpm deploy            # Deploy all stacks (cdk deploy)
```

AWS profile: `--profile private-mcp` (account `951921971435`, us-west-2)

Slack config is loaded from `.env` automatically (see `.env.example` for required vars).

## Architecture

```
Slack ──webhook──▶ API Gateway ──▶ ingest-thought Lambda
                                        │
                                        ▼
AI Tools ──MCP──▶ API Gateway ──▶ mcp-server Lambda
                  (x-api-key)           │
                                        ▼
                                  process-thought Lambda
                                    │           │
                                    ▼           ▼
                              Bedrock       Bedrock
                            (Titan Embed)  (Haiku classify)
                                    │           │
                                    └─────┬─────┘
                                          ▼
                                     S3 Vectors
```

## Source Layout

```
private-mcp/
├── hooks/
│   ├── mcp-session-start.sh          # SessionStart hook — exposes session_id to Claude
│   ├── mcp-session-hook.sh           # SessionEnd hook — captures session summary
│   └── mcp-prompt-capture.sh         # UserPromptSubmit hook — captures user prompts
├── infra/
│   ├── bin/app.ts                    # CDK app entry — stack instantiation
│   └── lib/
│       ├── config/index.ts           # PrivateMCPConfig (account ID, region, tags)
│       └── stacks/
│           └── private-mcp-stack.ts      # Single stack: all resources
├── lambdas/
│   ├── process-thought/              # Core: embed + classify + store + Slack reply
│   │   ├── index.ts                  # Handler (parallel Bedrock calls → S3 Vectors → optional Slack reply)
│   │   ├── functions/
│   │   │   ├── generateEmbedding.ts  # Bedrock Titan Embeddings v2
│   │   │   ├── classifyThought.ts    # Bedrock Claude 3 Haiku
│   │   │   ├── storeThought.ts       # S3 Vectors PutVectors
│   │   │   ├── formatConfirmation.ts # Format Slack reply text
│   │   │   └── replyInSlack.ts       # Post threaded Slack reply
│   │   └── utils/
│   │       └── createResponse.ts
│   ├── ingest-thought/               # Slack webhook handler (async fire-and-forget)
│   │   ├── index.ts                  # Slack event filtering + URL verification
│   │   └── functions/
│   │       └── invokeProcessThought.ts  # Async (Event) Lambda invocation
│   ├── mcp-server/                   # MCP protocol server
│   │   ├── index.ts                  # Lambda entry (serverless-express)
│   │   ├── server.ts                 # Express app + MCP tool registration
│   │   └── functions/
│   │       ├── searchThoughts.ts     # Semantic search via S3 Vectors
│   │       ├── browseRecent.ts       # List + filter recent thoughts
│   │       ├── getStats.ts           # Aggregate stats
│   │       ├── captureThought.ts     # Invoke process-thought
│   │       └── invokeDailySummary.ts # Invoke daily-summary Lambda
│   └── daily-summary/                # Daily report (EventBridge + MCP on-demand)
│       ├── index.ts                  # Handler: gather yesterday's data, format, post to Slack
│       └── functions/
│           ├── getTodaysThoughts.ts  # ListVectors + GetVectors filtered by date
│           ├── formatReport.ts       # Build two-section Slack message
│           └── postToSlack.ts        # Post to Slack channel
├── types/
│   ├── thought.ts                    # ThoughtMetadata, ProcessThoughtInput/Result, etc.
│   └── config.ts                     # Constants: bucket name, index, dimensions, model IDs
└── docs/plans/                       # Design and implementation docs
```

## Lambda Architecture

**Each Lambda is self-contained.** No shared code directories across Lambdas. Each Lambda has its own `functions/` and `utils/` subdirectories.

- **process-thought** — The core. Takes raw text, calls Bedrock Titan v2 for embedding + Bedrock Haiku for classification in parallel, writes to S3 Vectors. Invoked by both other Lambdas. When triggered from Slack (via `slackReply` context), replies in the Slack thread after processing.
- **ingest-thought** — Slack webhook handler. Handles `url_verification` challenge, filters messages, invokes process-thought asynchronously (Event invocation), returns 200 immediately to avoid Slack's 3-second retry.
- **mcp-server** — MCP protocol via `@modelcontextprotocol/sdk` in stateless mode. Express + `@codegenie/serverless-express`. Five tools: `search_thoughts`, `browse_recent`, `stats`, `capture_thought`, `daily_summary`.
- **daily-summary** — Generates a two-section report (performance metrics + content highlights) and posts to Slack. Triggered daily by EventBridge cron (~7am Pacific) for previous day's thoughts, or on-demand via `daily_summary` MCP tool. Schedule hour configured via `DAILY_SUMMARY_HOUR` in `.env` (UTC).

## Tech Stack

- **IaC**: CDK v2 (TypeScript), single stack
- **Runtime**: Lambda Node.js 22, esbuild bundling via NodejsFunction
- **Storage**: S3 Vectors (bucket: `private-mcp-thoughts-951921971435`, index: `thoughts`, 1024-dim, cosine)
- **Embeddings**: Amazon Titan Text Embeddings v2 (Bedrock)
- **Classification**: Claude 3 Haiku (Bedrock)
- **API**: API Gateway REST API, stage `api`
- **MCP Auth**: API Gateway API keys + usage plan
- **MCP SDK**: `@modelcontextprotocol/sdk` — imports from `sdk/server/mcp.js` and `sdk/server/streamableHttp.js`
- **Scheduling**: EventBridge cron rule for daily summary
- **Config**: dotenv for secrets and schedule config (`.env`, gitignored)

## API Endpoints

| Method | Path | Lambda | Auth |
|---|---|---|---|
| POST | `/slack/events` | ingest-thought | Public (Slack webhook) |
| POST | `/mcp` | mcp-server | API key required |
| GET | `/mcp` | mcp-server | API key required |
| DELETE | `/mcp` | mcp-server | API key required |

## MCP Tools

| Tool | Input | Description |
|---|---|---|
| `search_thoughts` | `query, limit?, threshold?` | Semantic search via embedding + cosine similarity |
| `browse_recent` | `limit?, type?, topic?` | List recent thoughts with optional filters |
| `stats` | none | Count, type breakdown, top topics, date range |
| `capture_thought` | `text, source?, project?, session_id?, session_name?` | Save a thought via process-thought |
| `daily_summary` | none | Generate and post yesterday's daily summary to Slack |

## S3 Vectors Gotchas (MUST FOLLOW)

- **Empty arrays not allowed in metadata** — filter out `[]` before PutVectors calls
- **IAM ARNs need both prefixes**: `vector-bucket/` AND `bucket/` in resource ARNs
- **Bucket names are globally unique** — use account ID suffix

## CDK Conventions (MUST FOLLOW)

- **Never hardcode stack outputs** into config files. Pass between stacks via CDK properties.
- **Tagging**: All resources get `Project: PrivateMCP` and `ManagedBy: cdk` via `cdk.Tags.of(app)`.
- **Slack secrets** loaded from `.env` via dotenv (gitignored). No `-c` context flags needed.
- **S3 Vectors bucket and index** are CDK-managed L1 constructs (`CfnVectorBucket`, `CfnIndex`).
- **EventBridge schedule** for daily summary uses `DAILY_SUMMARY_HOUR` from `.env` (UTC). Cron fires daily at that hour.

## AWS Account

| Account | ID | Profile | Purpose |
|---|---|---|---|
| private-mcp | `951921971435` | `private-mcp` | All Private MCP infrastructure |

Region: `us-west-2`

## Claude Code MCP Setup

To connect Claude Code to this MCP server as a native tool provider:

```bash
# Get the API key value
API_KEY=$(aws apigateway get-api-key --api-key p8o0sxzj9c --include-value \
  --profile private-mcp --region us-west-2 --query 'value' --output text)

# Register the MCP server (--scope user makes it available in ALL projects)
claude mcp add --transport http --scope user private-mcp \
  "https://h5digtl3r8.execute-api.us-west-2.amazonaws.com/api/mcp" \
  --header "x-api-key: $API_KEY"
```

**Always use `--scope user`.** The default `--scope local` only registers the MCP for the current project directory — sessions in other projects won't have access to the tools.

Restart Claude Code after adding. The five MCP tools (`stats`, `browse_recent`, `search_thoughts`, `capture_thought`, `daily_summary`) will be available as native tools.

## Security

- **Slack webhook verification**: Requests to `/slack/events` are verified via HMAC-SHA256 signature using `SLACK_SIGNING_SECRET` (required in `.env`). 5-minute replay window.
- **CORS**: Any `localhost` origin is allowed automatically. Set `ALLOWED_ORIGINS` env var to add production domains.
- **Input validation**: All REST API endpoints validate UUID format, date format, text length (10K), query length (1K), enum values, and request body size (50KB).
- **CloudWatch alarms**: Optional 5xx alarm via SNS. Set `ALERT_EMAIL` in `.env` to enable.

## Future Plans

- Web UI frontend (separate repo)
- Additional capture sources
