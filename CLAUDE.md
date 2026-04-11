# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Private MCP is a private MCP server on AWS for personal thought capture and semantic retrieval. Capture thoughts from any MCP-connected AI tool, the web UI, or Slack — they get embedded, classified, and stored in S3 Vectors. Any connected tool can search your thoughts by meaning.

All data stays within a dedicated AWS account. No third-party API routing.

## Commands

Package manager is **npm**. All commands run from the repo root.

```bash
npm install            # Install dependencies
npm run build          # TypeScript compile (tsc)
npm run synth          # Generate CloudFormation templates (cdk synth)
npm run diff           # Preview infrastructure changes (cdk diff)
npm run deploy         # Deploy all stacks (cdk deploy)
```

AWS profile: `--profile <YOUR_AWS_PROFILE>` (set account ID, region, and credentials in `.env`)

Config is loaded from `.env` automatically (see `.env.example` for required vars).

## Architecture

```
AI Tools ──MCP──▶ API Gateway ──▶ Lambda Authorizer ──▶ mcp-server Lambda
                  (x-api-key)   (API key → user+team)         │
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

Slack ──webhook──▶ API Gateway ──▶ ingest-thought Lambda ──▶ process-thought
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
│   ├── authorizer/                   # Custom Lambda authorizer
│   │   ├── index.ts                  # API key → user + team resolution
│   │   └── functions/
│   │       ├── hashApiKey.ts         # SHA-256 hash of raw key
│   │       └── lookupApiKey.ts       # DynamoDB lookup by keyHash GSI
│   ├── process-thought/              # Core: embed + classify + store
│   │   ├── index.ts                  # Handler (parallel Bedrock calls → S3 Vectors → optional Slack reply)
│   │   ├── functions/
│   │   │   ├── generateEmbedding.ts  # Bedrock Titan Embeddings v2
│   │   │   ├── classifyThought.ts    # Bedrock Claude 3 Haiku
│   │   │   ├── storeThought.ts       # S3 Vectors PutVectors
│   │   │   ├── formatConfirmation.ts # Format Slack reply text
│   │   │   └── replyInSlack.ts       # Post threaded Slack reply
│   │   └── utils/
│   │       └── createResponse.ts
│   ├── mcp-server/                   # MCP protocol server
│   │   ├── index.ts                  # Lambda handler + Web Standard MCP transport
│   │   └── functions/
│   │       ├── searchThoughts.ts     # Semantic search via S3 Vectors
│   │       ├── browseRecent.ts       # List + filter recent thoughts
│   │       ├── getStats.ts           # Aggregate stats
│   │       ├── captureThought.ts     # Invoke process-thought
│   │       └── invokeDailySummary.ts # Invoke daily-summary Lambda
│   ├── daily-summary/                # Daily report (EventBridge + MCP on-demand)
│   │   ├── index.ts                  # Handler: gather yesterday's data, format, post to Slack
│   │   └── functions/
│   │       ├── getTodaysThoughts.ts  # ListVectors + GetVectors filtered by date
│   │       ├── formatReport.ts       # Build two-section Slack message
│   │       └── postToSlack.ts        # Post to Slack channel
│   └── rest-api/                     # REST API backend for the web UI
│       ├── index.ts                  # Lambda handler + route dispatch
│       └── functions/
│           ├── listThoughts.ts       # Paginated list with filters
│           ├── getThought.ts         # Get single thought by ID
│           ├── editThought.ts        # Update thought metadata
│           ├── deleteThought.ts      # Delete thought from DDB + S3 Vectors
│           ├── searchThoughts.ts     # Semantic search (same as MCP but via REST)
│           ├── captureThought.ts     # Capture via REST
│           ├── getTimeSeries.ts      # Activity timeseries for dashboard charts
│           ├── getProjects.ts        # List distinct projects
│           ├── generateNarrative.ts  # AI-generated report narrative (Bedrock)
│           ├── getEnrichmentSettings.ts  # Read enrichment config from DDB
│           └── putEnrichmentSettings.ts  # Update enrichment config
│   └── ingest-thought/               # Slack webhook handler (optional)
│       ├── index.ts                  # Slack event filtering + URL verification
│       └── functions/
│           └── invokeProcessThought.ts  # Async (Event) Lambda invocation
├── scripts/
│   └── migrate-to-dynamodb.ts        # One-time migration: S3 Vectors metadata → DDB
├── types/
│   ├── thought.ts                    # ThoughtMetadata, ProcessThoughtInput/Result, etc.
│   └── config.ts                     # Constants: bucket name, index, dimensions, model IDs
├── ui/                               # Web dashboard (Vite + React + Cloudscape)
│   └── src/pages/
│       ├── Dashboard/                # Activity charts, stats, recent thoughts
│       ├── Browse/                   # Paginated thought list with filters
│       ├── Search/                   # Semantic search interface
│       ├── Capture/                  # Manual thought capture form
│       ├── Reports/                  # AI-generated narrative reports
│       └── Settings/                 # Enrichment settings (types, topics, prompts)
└── docs/images/                      # README screenshots
```

## Lambda Architecture

**Each Lambda is self-contained.** No shared code directories across Lambdas. Each Lambda has its own `functions/` and `utils/` subdirectories.

- **process-thought** — The core. Takes raw text, calls Bedrock Titan v2 for embedding + Bedrock Haiku for classification in parallel, writes to S3 Vectors. All capture sources invoke this Lambda.
- **authorizer** — Custom Lambda authorizer. Resolves API key → user + team via SHA-256 hash lookup in the api-keys DynamoDB table. Injects user_id, username, team_id, and role into the request context.
- **mcp-server** — MCP protocol via `@modelcontextprotocol/sdk` with Web Standard MCP transport. Raw Lambda handler (no Express). Five tools: `search_thoughts`, `browse_recent`, `stats`, `capture_thought`, `daily_summary`.
- **rest-api** — REST backend for the web UI. Raw Lambda handler with route dispatch (no Express). CRUD for thoughts, semantic search, timeseries stats, AI narrative reports, enrichment settings. Data stored in DynamoDB (`private-mcp-thoughts-v2` table) with GSIs for type, source, project, and date queries.
- **daily-summary** — Generates a two-section report (performance metrics + content highlights). Triggered daily by EventBridge cron or on-demand via `daily_summary` MCP tool. Schedule hour configured via `DAILY_SUMMARY_HOUR` in `.env` (UTC).
- **enrich-thought** — Async enrichment pipeline. Performs deeper metadata extraction (related projects, refined summaries) after initial capture. Invoked asynchronously so it doesn't block the capture response.
- **ingest-thought** — Optional Slack webhook handler. Filters messages, invokes process-thought asynchronously, returns 200 immediately to avoid Slack's 3-second retry.

## Tech Stack

- **IaC**: CDK v2 (TypeScript), single stack
- **Runtime**: Lambda Node.js 22, esbuild bundling via NodejsFunction
- **Storage**: S3 Vectors (bucket: `private-mcp-thoughts-<YOUR_ACCOUNT_ID>`, index: `thoughts`, 1024-dim, cosine)
- **Embeddings**: Amazon Titan Text Embeddings v2 (Bedrock)
- **Classification**: Claude 3 Haiku (Bedrock)
- **API**: API Gateway REST API, stage `api`
- **Auth**: Custom Lambda authorizer (API key → user + team via SHA-256 hash lookup)
- **MCP SDK**: `@modelcontextprotocol/sdk` — imports from `sdk/server/mcp.js` and `sdk/server/streamableHttp.js`
- **Scheduling**: EventBridge cron rule for daily summary
- **Config**: dotenv for secrets and schedule config (`.env`, gitignored)

## API Endpoints

| Method | Path | Lambda | Auth |
|---|---|---|---|
| POST | `/mcp` | mcp-server | Custom authorizer |
| GET | `/mcp` | mcp-server | Custom authorizer |
| DELETE | `/mcp` | mcp-server | Custom authorizer |
| GET | `/api/thoughts` | rest-api | Custom authorizer |
| GET | `/api/thoughts/:id` | rest-api | Custom authorizer |
| PUT | `/api/thoughts/:id` | rest-api | Custom authorizer |
| DELETE | `/api/thoughts/:id` | rest-api | Custom authorizer |
| POST | `/api/search` | rest-api | Custom authorizer |
| POST | `/api/capture` | rest-api | Custom authorizer |
| GET | `/api/stats/timeseries` | rest-api | Custom authorizer |
| GET | `/api/projects` | rest-api | Custom authorizer |
| POST | `/api/reports/generate` | rest-api | Custom authorizer |
| GET | `/api/settings/enrichment` | rest-api | Custom authorizer |
| PUT | `/api/settings/enrichment` | rest-api | Custom authorizer |
| POST | `/slack/events` | ingest-thought | Public (optional Slack webhook) |

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
| private-mcp | `<YOUR_ACCOUNT_ID>` | `<YOUR_AWS_PROFILE>` | All Private MCP infrastructure |

Region: `us-west-2`

## Claude Code MCP Setup

To connect Claude Code to this MCP server as a native tool provider, use `headersHelper` instead of static `--header` flags. Claude Code's OAuth detection can misidentify static headers on HTTP servers as "needs authentication." A `headersHelper` script bypasses this.

**Step 1: Create a headers helper script** (e.g. `~/.claude/scripts/private-mcp-headers.sh`):

```bash
#!/bin/bash
# Get the API key value
API_KEY=$(aws apigateway get-api-key --api-key <API_KEY_ID> --include-value \
  --profile <YOUR_AWS_PROFILE> --region us-west-2 --query 'value' --output text)
echo "{\"x-api-key\": \"$API_KEY\"}"
```

Or for a simpler static version: `echo '{"x-api-key": "<YOUR_API_KEY>"}'`

Make it executable: `chmod +x ~/.claude/scripts/private-mcp-headers.sh`

**Step 2: Register the MCP server** using `add-json` with `--scope user`:

```bash
claude mcp add-json --scope user private-mcp \
  '{"type":"http","url":"https://<API_GATEWAY_ID>.execute-api.<REGION>.amazonaws.com/api/mcp","headersHelper":"~/.claude/scripts/private-mcp-headers.sh"}'
```

**Always use `--scope user`.** The default `--scope local` only registers the MCP for the current project directory — sessions in other projects won't have access to the tools.

Restart Claude Code after adding. The five MCP tools (`stats`, `browse_recent`, `search_thoughts`, `capture_thought`, `daily_summary`) will be available as native tools.

## Security

- **Slack webhook verification**: Requests to `/slack/events` are verified via HMAC-SHA256 signature using `SLACK_SIGNING_SECRET` (required in `.env`). 5-minute replay window.
- **CORS**: Any `localhost` origin is allowed automatically. Set `ALLOWED_ORIGINS` env var to add production domains.
- **Input validation**: All REST API endpoints validate UUID format, date format, text length (10K), query length (1K), enum values, and request body size (50KB).
- **CloudWatch alarms**: Optional 5xx alarm via SNS. Set `ALERT_EMAIL` in `.env` to enable.

## Future Plans

- Additional capture sources
