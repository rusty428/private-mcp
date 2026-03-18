# PrivateMCP Project Memory

## Project Overview
- **PrivateMCP** = private MCP server on AWS for personal thought capture and semantic retrieval
- All data stays within a dedicated AWS account
- GitHub: rusty428/private-mcp

## AWS Account
- **private-mcp** `<YOUR_ACCOUNT_ID>` | Profile: `<YOUR_AWS_PROFILE>` | Region: `us-west-2`
- CDK bootstrapped in us-west-2

## Deployed Endpoints
- **API Gateway**: CDK output `ApiUrl`
- **Slack webhook**: `<ApiUrl>/slack/events`
- **MCP endpoint**: `<ApiUrl>/mcp`
- **API Key ID**: CDK output `ApiKeyId`

## Slack App
- Bot scopes: `channels:history`, `groups:history`, `chat:write`
- Event subscriptions: `message.channels`, `message.groups`
- Capture channel ID: set in `.env` as `SLACK_CAPTURE_CHANNEL`

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
- Web UI frontend (separate repo)
- Deduplication for Slack retry issue
- Additional capture sources (API endpoint, web UI)
