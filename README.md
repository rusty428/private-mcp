# AWSPrivateMCP

A private MCP server built entirely on AWS. Captures, embeds, classifies, and semantically searches your thoughts. No third-party API routing — your data never leaves your AWS account.

## What It Does

Type a thought in Slack — it gets embedded, classified, and stored automatically. Then any MCP-connected AI tool (Claude, ChatGPT, Cursor, Claude Code) can search your thoughts by meaning and write new ones directly.

## How It Works

1. **Capture** — Send a message in your Slack capture channel. A Lambda generates a vector embedding (Bedrock Titan v2) and extracts metadata (Bedrock Haiku) in parallel, then stores everything in S3 Vectors.

2. **Retrieve** — Any AI tool connected via MCP can search your thoughts semantically, browse recent entries, view stats, or capture new thoughts without switching apps.

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
- **Bedrock** — Amazon Titan Embeddings v2 + Claude 3 Haiku
- **API Gateway** — REST API with API key auth for MCP, public webhook for Slack
- **Lambda** — Node.js 22, esbuild bundling

## MCP Tools

| Tool | Description |
|---|---|
| `search_thoughts` | Semantic search — find thoughts by meaning, not keywords |
| `browse_recent` | List recent thoughts, filter by type or topic |
| `stats` | Overview: total count, type breakdown, top topics, date range |
| `capture_thought` | Save a thought from any connected AI tool |

## Cost

All services run on pay-per-use pricing. At ~20 thoughts/day, expect < $1/month.

## Docs

- [DEVELOPER.md](DEVELOPER.md) — Setup, deployment, and configuration
- [ARCHITECTURE.md](ARCHITECTURE.md) — Detailed architecture and design decisions
