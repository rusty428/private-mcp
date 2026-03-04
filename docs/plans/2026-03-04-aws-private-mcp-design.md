# AWSPrivateMCP — Design Document

## Overview

A private MCP server on AWS that captures, embeds, classifies, and semantically searches personal thoughts. All data stays within a dedicated AWS account — no third-party API routing.

Inspired by the Open Brain guide (Supabase + OpenRouter + Slack), rebuilt entirely on AWS: S3 Vectors, Bedrock, API Gateway, Lambda.

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
                                    (store + search)
```

## AWS Account

- New dedicated account in FeO org
- Region: us-west-2
- CDK bootstrap required in us-west-2

## Tech Stack

- **IaC**: CDK v2 (TypeScript)
- **Runtime**: Lambda (TypeScript, esbuild bundling via NodejsFunction)
- **Storage**: S3 Vectors (1 bucket, 1 index)
- **Embeddings**: Amazon Titan Embeddings v2 (Bedrock, 1024 dimensions)
- **Classification**: Claude Haiku (Bedrock)
- **API**: API Gateway REST API
- **Auth**: API Gateway API keys + usage plan
- **Secrets**: Lambda environment variables via CDK context

## Repo Structure

```
~/projects/AWSPrivateMCP/
├── aws-private-mcp-infra/    (git: rusty428/aws-private-mcp-infra)
│   ├── cdk.json
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── tsconfig.json
│   ├── infra/
│   │   ├── bin/
│   │   │   └── app.ts
│   │   └── lib/
│   │       └── aws-private-mcp-stack.ts
│   ├── lambdas/
│   │   ├── process-thought/
│   │   │   └── index.ts
│   │   ├── ingest-thought/
│   │   │   └── index.ts
│   │   └── mcp-server/
│   │       └── index.ts
│   └── types/
│       ├── thought.ts
│       └── config.ts
│
└── aws-private-mcp-web/      (future, separate repo)
```

Single flat package, pnpm, CLI deploy. Follows the badgerfy-infra pattern.

## Data Model

S3 Vectors — one vector bucket, one index:

- **Bucket**: aws-private-mcp-thoughts
- **Index**: thoughts
- **Dimensions**: 1024 (Titan v2)
- **Distance metric**: cosine similarity

Each vector record:
- **key**: UUID (generated at write time)
- **vector**: 1024-dimensional embedding
- **metadata** (JSON):
  - `content`: raw thought text
  - `type`: "observation" | "task" | "idea" | "reference" | "person_note"
  - `topics`: string[] (1-3 short topic tags)
  - `people`: string[] (people mentioned)
  - `action_items`: string[] (implied to-dos)
  - `dates_mentioned`: string[] (YYYY-MM-DD format)
  - `source`: "slack" | "mcp" | "api"
  - `source_ref`: optional source-specific reference (e.g., slack_ts)
  - `created_at`: ISO 8601 timestamp

### Design Guardrails

- Storage writes go through a single utility function
- Vector dimension is a config constant
- Metadata schema is typed in types/ — shared across all lambdas
- Storage layer is behind a clean interface — swappable without touching capture or retrieval code

## Lambdas

### process-thought (core)

- **Input**: `{ text: string, source: string, sourceRef?: string }`
- Calls Bedrock Titan v2 for embedding + Bedrock Haiku for classification — in parallel
- Writes vector + metadata to S3 Vectors
- **Returns**: `{ id, type, topics, people, action_items, created_at }`

### ingest-thought (Slack handler)

- Handles Slack `url_verification` challenge
- Filters: only `message` events, no bot messages, no subtypes, configured channel only
- Extracts text, invokes `process-thought` Lambda
- Posts threaded reply in Slack with confirmation summary

### mcp-server (MCP protocol)

- Uses `@modelcontextprotocol/sdk` with streamable HTTP transport
- API Gateway API key auth (x-api-key header)
- Four tools:

| Tool | Input | Description |
|---|---|---|
| `search_thoughts` | `query, limit?, threshold?` | Embeds query via Bedrock, cosine search S3 Vectors |
| `browse_recent` | `limit?, type?, topic?` | Lists recent thoughts with optional filters |
| `stats` | none | Count, type breakdown, top topics, date range |
| `capture_thought` | `text, source?` | Invokes process-thought, returns confirmation |

## Infrastructure (CDK)

Single stack: `AWSPrivateMCPStack`

- S3 Vector bucket + thoughts index
- Three Lambda functions (NodejsFunction, esbuild)
- API Gateway REST API:
  - `POST /slack/events` — public (Slack webhook)
  - MCP endpoint — API key secured + usage plan
- IAM: Lambdas get Bedrock invoke + S3 Vectors read/write
- process-thought gets invoke policy for other Lambdas to call it
- Slack bot token + channel ID as Lambda env vars via CDK context

### CDK Outputs

- API Gateway URL
- API key value
- Slack webhook URL

## Capture Sources

- **Slack**: Channel webhook → ingest-thought → process-thought
- **MCP**: Any AI tool → mcp-server capture_thought → process-thought
- **Future**: New sources just need a thin adapter Lambda that invokes process-thought

## Cost Estimate

- S3 Vectors: pay-per-query, minimal at personal scale
- Bedrock Titan Embeddings v2: ~$0.02/million tokens
- Bedrock Haiku: ~$0.25/million input tokens
- Lambda + API Gateway: free tier covers personal usage
- Estimated: < $1/month at 20 thoughts/day
