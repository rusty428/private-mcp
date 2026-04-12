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
│   POST/GET/DELETE /mcp          POST /slack/events       │
│   (API key required)            (optional, public)       │
│          │                               │               │
│          ▼                               ▼               │
│   ┌────────────────┐           ┌──────────────┐          │
│   │ mcp-server     │           │ ingest-      │          │
│   │                │           │ thought      │          │
│   │ 13 MCP tools:  │           │              │          │
│   │ - search/browse│           │ Slack events │          │
│   │ - stats/capture│           │ filtering    │          │
│   │ - daily_summary│           │ + reply      │          │
│   │ - kg_* (5)     │           └──────┬───────┘          │
│   │ - connections(3)│                 │                  │
│   └───┬────────┬───┘    Lambda invoke │                  │
│       │        │                      │                  │
│       ▼        │                      ▼                  │
│   ┌──────────────────────────────────┐                   │
│   │ process-thought (core)           │                   │
│   │                                  │                   │
│   │  ┌────────────┐ ┌────────────┐   │                   │
│   │  │ Bedrock    │ │ Bedrock    │   │                   │
│   │  │ Titan v2   │ │ Haiku      │   │                   │
│   │  │ (embed)    │ │ (classify) │   │                   │
│   │  └─────┬──────┘ └─────┬──────┘   │                   │
│   │        │    parallel   │          │                   │
│   │        └───────┬───────┘          │                   │
│   │                ▼                  │                   │
│   │         ┌────────────┐            │                   │
│   │         │ S3 Vectors │ ◀──────────┘                   │
│   │         │ (store)    │  (search/browse/stats)         │
│   │         └────────────┘                               │
│   └──────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

## Components

### API Gateway

REST API with two route groups:

- **`POST|GET|DELETE /mcp`** — Secured with API Gateway API key + usage plan (10 rps, 20 burst). Handles the MCP protocol.
- **`POST /slack/events`** — Optional. Public webhook for Slack capture, verified via HMAC-SHA256 signature.

CORS is enabled on all routes.

### process-thought Lambda

The core of the system. All capture sources invoke it.

**Input:** `{ text, source, sourceRef? }`

**Pipeline:**
1. Generate a 1024-dimensional embedding via Bedrock Titan Embeddings v2
2. Extract structured metadata via Bedrock Claude 3 Haiku (type, topics, people, action items, dates)
3. Steps 1 and 2 run in parallel via `Promise.all`
4. Store the embedding + metadata in S3 Vectors

**Output:** `{ id, type, topics, people, action_items, created_at }`

The metadata extraction prompt asks Haiku to classify the thought as one of: `observation`, `task`, `idea`, `reference`, `person_note`, `decision`, `project_summary`, `milestone`. It also extracts topic tags, mentioned people, implied action items, and dates. If Haiku returns malformed JSON, a safe fallback is used.

### mcp-server Lambda

MCP protocol server using `@modelcontextprotocol/sdk` in stateless mode.

- Express app wrapped with `@codegenie/serverless-express` for API Gateway compatibility
- Creates a fresh `McpServer` + `StreamableHTTPServerTransport` per request (stateless — no session tracking)
- `enableJsonResponse: true` — returns JSON instead of SSE (API Gateway doesn't support streaming)
- Registers 13 tools that AI clients discover via the MCP protocol

**Tools:**

| Tool | What it does |
|---|---|
| `search_thoughts` | Embeds the query via Bedrock, runs cosine similarity search against S3 Vectors, returns ranked results |
| `browse_recent` | Lists vectors, fetches metadata, filters by type/topic, sorts by `created_at` descending |
| `stats` | Aggregates: total count, breakdown by type, top 10 topics, date range |
| `capture_thought` | Invokes `process-thought` — same embed + classify + store pipeline |
| `daily_summary` | Generates and posts a daily activity summary to Slack |
| `kg_query` | Gets all relationships for an entity from the knowledge graph with temporal validity |
| `kg_add` | Adds a relationship fact — auto-creates entities, validates predicate vocabulary |
| `kg_invalidate` | Marks a relationship as no longer true — preserves history with end date |
| `kg_timeline` | Chronological story of an entity — all facts ordered by time |
| `kg_predicates` | View and manage the relationship vocabulary (list, add, remove) |
| `find_connections` | Queries DDB `gsi-by-project` for two projects, intersects topics and people arrays |
| `explore_topic` | Queries S3 Vectors with `$in` filter on topics array, aggregates projects and people |
| `explore_person` | Queries S3 Vectors with `$in` filter on people array, aggregates projects and topics |

### daily-summary Lambda

Generates a two-section report (performance metrics + content highlights) and posts to Slack. Triggered daily by an EventBridge cron rule, or on-demand via the `daily_summary` MCP tool. Schedule hour configured via `DAILY_SUMMARY_HOUR` in `.env` (UTC).

### enrich-thought Lambda

Async enrichment pipeline. After `process-thought` stores the initial embedding and classification, this Lambda performs deeper metadata extraction — related projects, refined summaries, and additional context. Invoked asynchronously so it doesn't block the initial capture response.

### rest-api Lambda

REST backend for the web UI. Express app wrapped with `@codegenie/serverless-express`. Provides CRUD for thoughts, semantic search, timeseries stats, AI-generated narrative reports, project listing, and enrichment settings management. Data is read from both DynamoDB (metadata, settings) and S3 Vectors (embeddings, search).

### DynamoDB

The `private-mcp-thoughts` table stores thought metadata with GSIs for efficient querying by type, source, project, and date. The `private-mcp-settings` table stores enrichment configuration (type taxonomy, topic lists, prompt templates). DynamoDB complements S3 Vectors — vectors handle embedding storage and similarity search, DDB handles structured queries and pagination.

### Web UI

Vite + React + Cloudscape Design System. Six pages: Dashboard (activity charts, stats), Browse (paginated list with filters), Search (semantic search), Capture (manual thought entry), Reports (AI-generated narratives), and Settings (enrichment configuration). Connects to the rest-api Lambda via API Gateway. Runs locally via `npm run mcp-ui` or can be deployed as a static site behind CloudFront.

### ingest-thought Lambda (optional)

Handles Slack webhook events. Only needed if using Slack as a capture source.

1. Responds to Slack's `url_verification` challenge during setup
2. Filters events: only `message` type, no bot messages, no subtypes, configured channel only
3. Invokes `process-thought` via Lambda-to-Lambda call
4. Posts a threaded reply in Slack with the classification summary

### S3 Vectors

Vector storage with native similarity search.

- **Bucket:** `private-mcp-thoughts-<YOUR_ACCOUNT_ID>`
- **Index:** `thoughts`
- **Dimensions:** 1024 (Titan Embeddings v2)
- **Distance metric:** cosine
- **Managed by CDK** via L1 constructs (`CfnVectorBucket`, `CfnIndex`)

Each vector record:
- **key** — UUID
- **vector** — 1024-dimensional float32 embedding
- **metadata** — content, type, topics, people, action_items, dates_mentioned, source, source_ref, created_at

Metadata fields that are empty arrays are omitted (S3 Vectors does not allow empty arrays).

## Data Flow: MCP Capture

```
AI tool calls capture_thought via MCP
       │
       ▼
mcp-server Lambda
  └── Invokes process-thought Lambda
        ├── Bedrock Titan v2 → 1024-dim embedding
        ├── Bedrock Haiku → { type, topics, people, action_items, dates }
        │   (parallel)
        └── S3 Vectors PutVectors → stored
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

## Data Flow: Slack Capture (optional)

```
User types in Slack
       │
       ▼
ingest-thought Lambda
  ├── Validates: message type, no bot, correct channel
  ├── Invokes process-thought Lambda (same pipeline as above)
  └── Posts threaded reply in Slack: "Captured as *type* — topics"
```

## Security

- **MCP endpoint** — API Gateway API key required on every request. Key managed by CDK, retrievable via AWS CLI. Batch requests rejected, body size limited to 16KB.
- **IAM** — Each Lambda has least-privilege permissions scoped to specific resources.
- **Slack webhook** — If enabled, verified via HMAC-SHA256 signature with 5-minute replay protection. Filters on channel ID and ignores bot messages.
- **No VPC** — All services are accessed via service endpoints. No public-facing compute beyond Lambda behind API Gateway.

## Design Decisions

### Why three Lambdas instead of two?

A simpler approach would use two functions (Slack handler + MCP server). We split the core logic into `process-thought` so that:
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
