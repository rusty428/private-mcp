# Developer Guide

## Prerequisites

- Node.js 22+
- pnpm
- AWS CLI v2 with SSO configured
- AWS CDK CLI (`npm install -g aws-cdk`)

## Setup

```bash
cd ~/projects/AWSPrivateMCP/aws-private-mcp-infra
pnpm install
```

## Commands

```bash
pnpm build             # TypeScript compile
pnpm synth             # Generate CloudFormation template
pnpm diff              # Preview infrastructure changes
pnpm deploy            # Deploy (requires --profile and -c flags, see below)
```

## AWS Account

| Field | Value |
|---|---|
| Account ID | `951921971435` |
| Profile | `private-mcp` |
| Region | `us-west-2` |

Authenticate via SSO:

```bash
aws sso login
aws sts get-caller-identity --profile private-mcp
```

## Deploying

The stack requires Slack credentials passed as CDK context:

```bash
npx cdk deploy AWSPrivateMCPStack --profile private-mcp \
  -c slackBotToken=xoxb-your-token \
  -c slackCaptureChannel=C0your-channel-id
```

### Deploy Outputs

After deployment, CDK outputs:

- **ApiUrl** — Base API Gateway URL
- **SlackWebhookUrl** — URL to paste into Slack Event Subscriptions
- **MCPEndpointUrl** — MCP server endpoint for AI tool connections
- **ApiKeyId** — Retrieve the actual key value with:

```bash
aws apigateway get-api-key --api-key <API_KEY_ID> --include-value --profile private-mcp
```

## Slack App Setup

### Create the App

1. Go to api.slack.com/apps → Create New App → From scratch
2. Name: whatever you want. Select your workspace.

### Set Permissions

1. OAuth & Permissions → Bot Token Scopes → add:
   - `channels:history`
   - `groups:history`
   - `chat:write`
2. Install to Workspace → copy the Bot User OAuth Token (`xoxb-...`)

### Configure Events

1. Event Subscriptions → Enable Events
2. Request URL: paste the **SlackWebhookUrl** from deploy output
3. Subscribe to bot events: `message.channels` and `message.groups`
4. Save Changes (reinstall if prompted)

### Invite Bot to Channel

In your capture channel: `/invite @YourAppName`

Get the channel ID: right-click channel → View channel details → scroll to bottom.

## Connecting AI Tools

### Claude Code

```bash
claude mcp add --transport http aws-private-mcp \
  https://<API_GATEWAY_URL>/mcp \
  --header "x-api-key: <YOUR_API_KEY>"
```

### Claude Desktop

Settings → Connectors → Add custom connector:
- Name: `AWSPrivateMCP`
- URL: `https://<API_GATEWAY_URL>/mcp`
- Add header `x-api-key: <YOUR_API_KEY>`

### Cursor / VS Code (via mcp-remote)

```json
{
  "mcpServers": {
    "aws-private-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://<API_GATEWAY_URL>/mcp",
        "--header",
        "x-api-key:<YOUR_API_KEY>"
      ]
    }
  }
}
```

Note: no space after the colon in the header value.

## Project Structure

```
aws-private-mcp-infra/
├── infra/
│   ├── bin/app.ts                    # CDK app entry
│   └── lib/
│       ├── config/index.ts           # Account ID, region, tags
│       └── stacks/
│           └── aws-private-mcp-stack.ts
├── lambdas/
│   ├── process-thought/              # Core: embed + classify + store
│   ├── ingest-thought/               # Slack webhook handler
│   └── mcp-server/                   # MCP protocol server
├── types/
│   ├── thought.ts                    # Domain types
│   └── config.ts                     # Constants (bucket, index, model IDs)
└── docs/plans/                       # Design docs
```

### Lambda Convention

Each Lambda is self-contained under `lambdas/<name>/`:

- `index.ts` — Handler. Thin orchestration only.
- `functions/` — Business logic specific to this Lambda.
- `utils/` — Generic utilities (duplicated across Lambdas by design).

One function per file. File name matches the exported function name.

## Troubleshooting

### Slack messages not triggering the function

- Verify both `message.channels` and `message.groups` are subscribed in Event Subscriptions
- Confirm the bot is invited to the channel
- Check the channel ID in the deploy context matches the actual channel

### Check Lambda logs

```bash
# List log groups
aws logs describe-log-groups --profile private-mcp --region us-west-2

# Tail a specific Lambda's logs
aws logs tail "/aws/lambda/<function-name>" --since 5m --profile private-mcp --region us-west-2
```

### S3 Vectors empty array error

S3 Vectors does not allow empty arrays in metadata. The `storeThought` function filters these out. If you add new array fields to metadata, apply the same pattern.

### Duplicate Slack replies

Slack retries webhook delivery after 3 seconds. If the full pipeline (embed + classify + store) takes longer, you get duplicate captures. This is cosmetic — the captures are identical.
