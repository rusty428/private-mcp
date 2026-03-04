# Architecture

## Design Principles

1. **No third-party data routing** — All AI processing happens via Bedrock within your AWS account. Thoughts are never sent to OpenAI, OpenRouter, or any external API.

2. **Extensible capture** — The core processing logic lives in a single Lambda (`process-thought`). Adding a new capture source means writing a thin adapter that invokes it. Slack and MCP are the first two; a web UI, mobile app, or API endpoint are just more adapters.

3. **Swappable storage** — All storage operations go through a single function (`storeThought`). The current backend is S3 Vectors. If requirements change (scale, cost, features), the storage layer can be swapped without touching capture or retrieval code.

4. **Config-driven** — Vector dimensions, model IDs, bucket names, and index names are constants in `types/config.ts`. Changing the embedding model or dimensions is a config change, not a code change.

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                      API Gateway                         │
│                                                          │
│   POST /slack/events (public)    POST/GET/DELETE /mcp    │
│          │                        (API key required)     │
│          ▼                               │               │
│   ┌──────────────┐              ┌────────▼───────┐       │
│   │ ingest-      │              │ mcp-server     │       │
│   │ thought      │              │                │       │
│   │              │              │ 4 MCP tools:   │       │
│   │ Slack events │              │ - search       │       │
│   │ filtering    │              │ - browse       │       │
│   │ + reply      │              │ - stats        │       │
│   └──────┬───────┘              │ - capture      │       │
│          │                      └───┬────────┬───┘       │
│          │     Lambda invoke        │        │           │
│          ▼                          ▼        │           │
│   ┌──────────────────────────────────┐       │           │
│   │ process-thought (core)           │       │           │
│   │                                  │       │           │
│   │  ┌────────────┐ ┌────────────┐   │       │           │
│   │  │ Bedrock    │ │ Bedrock    │   │       │           │
│   │  │ Titan v2   │ │ Haiku      │   │       │           │
│   │  │ (embed)    │ │ (classify) │   │       │           │
│   │  └─────┬──────┘ └─────┬──────┘   │       │           │
│   │        │    parallel   │          │       │           │
│   │        └───────┬───────┘          │       │           │
│   │                ▼                  │       │           │
│   │         ┌────────────┐            │       │           │
│   │         │ S3 Vectors │ ◀──────────────────┘           │
│   │         │ (store)    │  (search/browse/stats)         │
│   │         └────────────┘            │                   │
│   └──────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

## Components

### API Gateway

REST API with two route groups:

- **`POST /slack/events`** — Public. Receives Slack webhook events. Slack verifies the URL during setup and sends message events here.
- **`POST|GET|DELETE /mcp`** — Secured with API Gateway API key + usage plan (10 rps, 20 burst). Handles the MCP protocol.

CORS is enabled on all routes.

### process-thought Lambda

The core of the system. Both other Lambdas invoke it.

**Input:** `{ text, source, sourceRef? }`

**Pipeline:**
1. Generate a 1024-dimensional embedding via Bedrock Titan Embeddings v2
2. Extract structured metadata via Bedrock Claude 3 Haiku (type, topics, people, action items, dates)
3. Steps 1 and 2 run in parallel via `Promise.all`
4. Store the embedding + metadata in S3 Vectors

**Output:** `{ id, type, topics, people, action_items, created_at }`

The metadata extraction prompt asks Haiku to classify the thought as one of: `observation`, `task`, `idea`, `reference`, `person_note`. It also extracts topic tags, mentioned people, implied action items, and dates. If Haiku returns malformed JSON, a safe fallback is used.

### ingest-thought Lambda

Handles Slack webhook events.

1. Responds to Slack's `url_verification` challenge during setup
2. Filters events: only `message` type, no bot messages, no subtypes, configured channel only
3. Invokes `process-thought` via Lambda-to-Lambda call
4. Posts a threaded reply in Slack with the classification summary

### mcp-server Lambda

MCP protocol server using `@modelcontextprotocol/sdk` in stateless mode.

- Express app wrapped with `@codegenie/serverless-express` for API Gateway compatibility
- Creates a fresh `McpServer` + `StreamableHTTPServerTransport` per request (stateless — no session tracking)
- `enableJsonResponse: true` — returns JSON instead of SSE (API Gateway doesn't support streaming)
- Registers four tools that AI clients discover via the MCP protocol

**Tools:**

| Tool | What it does |
|---|---|
| `search_thoughts` | Embeds the query via Bedrock, runs cosine similarity search against S3 Vectors, returns ranked results |
| `browse_recent` | Lists vectors, fetches metadata, filters by type/topic, sorts by `created_at` descending |
| `stats` | Aggregates: total count, breakdown by type, top 10 topics, date range |
| `capture_thought` | Invokes `process-thought` — same pipeline as Slack capture |

### S3 Vectors

Vector storage with native similarity search.

- **Bucket:** `private-mcp-thoughts-951921971435`
- **Index:** `thoughts`
- **Dimensions:** 1024 (Titan Embeddings v2)
- **Distance metric:** cosine
- **Managed by CDK** via L1 constructs (`CfnVectorBucket`, `CfnIndex`)

Each vector record:
- **key** — UUID
- **vector** — 1024-dimensional float32 embedding
- **metadata** — content, type, topics, people, action_items, dates_mentioned, source, source_ref, created_at

Metadata fields that are empty arrays are omitted (S3 Vectors does not allow empty arrays).

## Data Flow: Slack Capture

```
User types in Slack
       │
       ▼
Slack sends POST to /slack/events
       │
       ▼
ingest-thought Lambda
  ├── Validates: message type, no bot, correct channel
  ├── Invokes process-thought Lambda
  │     ├── Bedrock Titan v2 → 1024-dim embedding
  │     ├── Bedrock Haiku → { type, topics, people, action_items, dates }
  │     │   (parallel)
  │     └── S3 Vectors PutVectors → stored
  └── Posts threaded reply in Slack: "Captured as *type* — topics"
```

## Data Flow: MCP Search

```
AI tool sends search query via MCP
       │
       ▼
mcp-server Lambda (search_thoughts tool)
  ├── Bedrock Titan v2 → embed the query
  ├── S3 Vectors QueryVectors → cosine similarity, top K
  └── Returns ranked results with metadata
```

## Security

- **MCP endpoint** — API Gateway API key required on every request. Key managed by CDK, retrievable via AWS CLI.
- **Slack webhook** — Public endpoint, but the Lambda filters on channel ID and ignores bot messages.
- **IAM** — Each Lambda has least-privilege permissions: process-thought gets S3 Vectors write + Bedrock invoke, ingest-thought gets Lambda invoke, mcp-server gets S3 Vectors read + Bedrock invoke + Lambda invoke.
- **No VPC** — All services are accessed via service endpoints. No public-facing compute beyond Lambda behind API Gateway.

## Design Decisions

### Why three Lambdas instead of two?

The Open Brain guide uses two functions (Slack handler + MCP server). We split the core logic into `process-thought` so that:
- No code is duplicated between Slack and MCP capture paths
- Adding a new capture source is a thin adapter Lambda, not a copy of the embed+classify+store pipeline
- The core can be tested and deployed independently

### Why S3 Vectors instead of DynamoDB?

DynamoDB with brute-force cosine similarity in Lambda would work at small scale. S3 Vectors gives us:
- Native similarity search (no in-Lambda computation)
- Pay-per-query pricing with no minimum
- Metadata filtering during search (not post-filter)
- A path to scale without architecture changes

### Why API Gateway API keys instead of Cognito?

This is a single-user personal tool. API keys are the simplest auth mechanism that API Gateway supports natively — no user pools, no token refresh, no OAuth flows. The key is generated by CDK, managed in AWS, and passed as a header.

### Why Express + serverless-express?

The MCP SDK's `StreamableHTTPServerTransport` expects Express-style `req`/`res` objects. Rather than mock these, `@codegenie/serverless-express` bridges API Gateway events to Express cleanly. The overhead is negligible for this use case.

### Why stateless MCP?

Lambda is inherently stateless — no persistent connections between invocations. The MCP SDK's stateless mode (`sessionIdGenerator: undefined`) is designed exactly for this: fresh server + transport per request, no session tracking, JSON responses instead of SSE streams.
