# PrivateMCP

A private MCP server built entirely in your AWS account. Captures, embeds, classifies, and semantically searches your thoughts. No third-party API routing — your data never leaves your AWS account.

## Quick Start

Requires Node.js 22+, AWS CLI v2 with SSO, CDK CLI (`npm install -g aws-cdk`), and [Bedrock model access](https://console.aws.amazon.com/bedrock/home#/modelaccess) enabled for Titan Embeddings v2 and Claude 3 Haiku.

```bash
git clone https://github.com/rusty428/private-mcp.git
cd private-mcp
npm install
cp .env.example .env   # Add your AWS account ID, region, and Slack credentials
npx cdk bootstrap --profile <your-profile>   # First time only
npx cdk deploy PrivateMCPStack --profile <your-profile>
```

After deploy, connect your AI tools using the MCP endpoint from the CDK output. See [DEVELOPER.md](DEVELOPER.md) for full setup including Slack app creation, AI tool configuration, and web UI deployment.

## What It Does

Capture thoughts from Slack, AI tools, or the web UI — they get embedded, classified, and stored automatically. Any MCP-connected tool (Claude Code, Cursor, Claude Desktop) can then search your thoughts by meaning and capture new ones as you work.

![Dashboard](docs/images/demo-dashboard.png)

![Browse](docs/images/demo-browse.png)

## How It Works

1. **Capture** — Send a thought from Slack, any MCP-connected AI tool, or the web UI. A Lambda generates a vector embedding (Bedrock Titan v2) and extracts metadata (Bedrock Haiku) in parallel, then stores everything in S3 Vectors and DynamoDB.

2. **Retrieve** — Search your thoughts by meaning, browse recent entries, view stats, or generate narrative reports — from any connected tool or the web dashboard.

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

## Stack

- **CDK v2** (TypeScript) — all infrastructure as code
- **S3 Vectors** — vector storage with cosine similarity search
- **DynamoDB** — thought metadata, enrichment settings, query indexes
- **Bedrock** — Amazon Titan Embeddings v2 + Claude 3 Haiku
- **API Gateway** — REST API with API key auth for MCP, public webhook for Slack
- **Lambda** — Node.js 22, esbuild bundling
- **Web UI** — Vite + React + Cloudscape Design System (dashboard, browse, search, capture, reports, settings)

## MCP Tools

| Tool | Description |
|---|---|
| `search_thoughts` | Semantic search — find thoughts by meaning, not keywords |
| `browse_recent` | List recent thoughts, filter by type or topic |
| `stats` | Overview: total count, type breakdown, top topics, date range |
| `capture_thought` | Save a thought from any connected AI tool |
| `daily_summary` | Generate and post a daily summary of recent activity to Slack |

## Cost

All services run on pay-per-use pricing. At ~20 thoughts/day, expect < $1/month.

## Docs

- [DEVELOPER.md](DEVELOPER.md) — Setup, deployment, and configuration
- [ARCHITECTURE.md](ARCHITECTURE.md) — Detailed architecture and design decisions
