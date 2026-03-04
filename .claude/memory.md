# AWSPrivateMCP Project Memory

## Project Overview
- **AWSPrivateMCP** = private MCP server on AWS for personal thought capture and semantic retrieval
- Inspired by "Open Brain" guide, rebuilt entirely on AWS — no third-party data routing
- All data stays within a dedicated AWS account
- GitHub: rusty428/aws-private-mcp-infra (private)

## AWS Account
- **private-mcp** `951921971435` | Profile: `private-mcp` | Region: `us-west-2`
- Part of FeO Organization (mgmt: `145676147420`)
- CDK bootstrapped in us-west-2
- Account registry updated in badgerfy runbook

## Deployed Endpoints
- **API Gateway**: `https://zjyd52hk73.execute-api.us-west-2.amazonaws.com/api/`
- **Slack webhook**: `.../api/slack/events`
- **MCP endpoint**: `.../api/mcp`
- **API Key ID**: `fe5nyv6n00`

## Slack App
- App name: "Open Brain" (can rename)
- Bot scopes: `channels:history`, `groups:history`, `chat:write`
- Event subscriptions: `message.channels`, `message.groups`
- Capture channel ID: `C0AJKJBSGSW`

## Gotchas Discovered During Build
- **S3 Vectors bucket names are globally unique** — use account ID suffix
- **S3 Vectors IAM ARNs**: need both `vector-bucket/` and `bucket/` prefixes in resource ARNs
- **S3 Vectors rejects empty arrays in metadata** — filter out `[]` before PutVectors
- **Anthropic on Bedrock**: new accounts must submit use case via AWS Marketplace before first invoke
- **Bedrock model access**: auto-enabled on first invoke now (no manual model access page)
- **MCP SDK package**: `@modelcontextprotocol/sdk` (NOT separate server/node packages)
- **MCP SDK imports**: `@modelcontextprotocol/sdk/server/mcp.js` and `.../server/streamableHttp.js`
- **MCP stateless mode**: `sessionIdGenerator: undefined` + `enableJsonResponse: true` for Lambda
- **Slack 3-second retry**: causes duplicate captures when pipeline takes >3s (cosmetic, not yet fixed)

## Future Plans
- Web UI frontend (`aws-private-mcp-web` repo)
- Deduplication for Slack retry issue
- Additional capture sources (API endpoint, web UI)
