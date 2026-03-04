# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AWSPrivateMCP is a private MCP server on AWS for personal thought capture and semantic retrieval. Type a thought in Slack or any MCP-connected AI tool — it gets embedded, classified, and stored in S3 Vectors. Any AI tool can search your thoughts by meaning.

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

Deploy with Slack config:
```bash
npx cdk deploy AWSPrivateMCPStack --profile private-mcp \
  -c slackBotToken=<token> -c slackCaptureChannel=<channel-id>
```

AWS profile: `--profile private-mcp` (account `951921971435`, us-west-2)

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
aws-private-mcp-infra/
├── infra/
│   ├── bin/app.ts                    # CDK app entry — stack instantiation
│   └── lib/
│       ├── config/index.ts           # AWSPrivateMCPConfig (account ID, region, tags)
│       └── stacks/
│           └── aws-private-mcp-stack.ts  # Single stack: all resources
├── lambdas/
│   ├── process-thought/              # Core: embed + classify + store
│   │   ├── index.ts                  # Handler (parallel Bedrock calls → S3 Vectors)
│   │   ├── functions/
│   │   │   ├── generateEmbedding.ts  # Bedrock Titan Embeddings v2
│   │   │   ├── classifyThought.ts    # Bedrock Claude 3 Haiku
│   │   │   └── storeThought.ts       # S3 Vectors PutVectors
│   │   └── utils/
│   │       └── createResponse.ts
│   ├── ingest-thought/               # Slack webhook handler
│   │   ├── index.ts                  # Slack event filtering + URL verification
│   │   └── functions/
│   │       ├── invokeProcessThought.ts
│   │       ├── replyInSlack.ts
│   │       └── formatConfirmation.ts
│   └── mcp-server/                   # MCP protocol server
│       ├── index.ts                  # Lambda entry (serverless-express)
│       ├── server.ts                 # Express app + MCP tool registration
│       └── functions/
│           ├── searchThoughts.ts     # Semantic search via S3 Vectors
│           ├── browseRecent.ts       # List + filter recent thoughts
│           ├── getStats.ts           # Aggregate stats
│           └── captureThought.ts     # Invoke process-thought
├── types/
│   ├── thought.ts                    # ThoughtMetadata, ProcessThoughtInput/Result, etc.
│   └── config.ts                     # Constants: bucket name, index, dimensions, model IDs
└── docs/plans/                       # Design and implementation docs
```

## Lambda Architecture

**Each Lambda is self-contained.** No shared code directories across Lambdas. Each Lambda has its own `functions/` and `utils/` subdirectories.

- **process-thought** — The core. Takes raw text, calls Bedrock Titan v2 for embedding + Bedrock Haiku for classification in parallel, writes to S3 Vectors. Invoked by both other Lambdas.
- **ingest-thought** — Slack webhook handler. Handles `url_verification` challenge, filters messages, invokes process-thought, replies in Slack thread.
- **mcp-server** — MCP protocol via `@modelcontextprotocol/sdk` in stateless mode. Express + `@codegenie/serverless-express`. Four tools: `search_thoughts`, `browse_recent`, `stats`, `capture_thought`.

## Tech Stack

- **IaC**: CDK v2 (TypeScript), single stack
- **Runtime**: Lambda Node.js 22, esbuild bundling via NodejsFunction
- **Storage**: S3 Vectors (bucket: `private-mcp-thoughts-951921971435`, index: `thoughts`, 1024-dim, cosine)
- **Embeddings**: Amazon Titan Text Embeddings v2 (Bedrock)
- **Classification**: Claude 3 Haiku (Bedrock)
- **API**: API Gateway REST API, stage `api`
- **MCP Auth**: API Gateway API keys + usage plan
- **MCP SDK**: `@modelcontextprotocol/sdk` — imports from `sdk/server/mcp.js` and `sdk/server/streamableHttp.js`

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
| `capture_thought` | `text, source?` | Save a thought via process-thought |

## S3 Vectors Gotchas (MUST FOLLOW)

- **Empty arrays not allowed in metadata** — filter out `[]` before PutVectors calls
- **IAM ARNs need both prefixes**: `vector-bucket/` AND `bucket/` in resource ARNs
- **Bucket names are globally unique** — use account ID suffix

## CDK Conventions (MUST FOLLOW)

- **Never hardcode stack outputs** into config files. Pass between stacks via CDK properties.
- **Tagging**: All resources get `Project: AWSPrivateMCP` and `ManagedBy: cdk` via `cdk.Tags.of(app)`.
- **Slack secrets** passed as CDK context (`-c slackBotToken=...`), set as Lambda env vars.
- **S3 Vectors bucket and index** are CDK-managed L1 constructs (`CfnVectorBucket`, `CfnIndex`).

## AWS Account

| Account | ID | Profile | Purpose |
|---|---|---|---|
| private-mcp | `951921971435` | `private-mcp` | All AWSPrivateMCP infrastructure |

Region: `us-west-2`

## Claude Code MCP Setup

To connect Claude Code to this MCP server as a native tool provider:

```bash
# Get the API key value
API_KEY=$(aws apigateway get-api-key --api-key fe5nyv6n00 --include-value \
  --profile private-mcp --region us-west-2 --query 'value' --output text)

# Register the MCP server
claude mcp add --transport http aws-private-mcp \
  "https://zjyd52hk73.execute-api.us-west-2.amazonaws.com/api/mcp" \
  --header "x-api-key: $API_KEY"
```

Restart Claude Code after adding. The four MCP tools (`stats`, `browse_recent`, `search_thoughts`, `capture_thought`) will be available as native tools.

## Future Plans

- Web UI frontend (`aws-private-mcp-web` separate repo)
- Deduplication for Slack 3-second retry issue
- Additional capture sources
