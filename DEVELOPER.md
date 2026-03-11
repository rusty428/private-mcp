# Developer Guide

## Prerequisites

- Node.js 22+
- pnpm
- AWS CLI v2 with SSO configured
- AWS CDK CLI (`npm install -g aws-cdk`)

## Setup

```bash
cd ~/projects/AWSPrivateMCP/private-mcp
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
npx cdk deploy PrivateMCPStack --profile private-mcp \
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
claude mcp add --transport http --scope user private-mcp \
  https://<API_GATEWAY_URL>/mcp \
  --header "x-api-key: <YOUR_API_KEY>"
```

**The `--scope user` flag is critical.** Without it, the MCP server is only registered for the current project directory. With `--scope user`, the MCP tools are available in every Claude Code session regardless of which project you're working in. Available scopes:

| Scope | Registered in | Available in |
|---|---|---|
| `local` (default) | `.claude.json` per project path | Only that project directory |
| `project` | `.claude/settings.json` in repo | Anyone who clones the repo |
| `user` | `~/.claude.json` | All projects on your machine |

### SessionEnd Hook (optional, recommended)

The MCP tools are only available when Claude Code is running. To ensure session activity is always captured — even if the AI doesn't proactively call `capture_thought` — add a SessionEnd hook to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/scripts/mcp-session-hook.sh",
            "timeout": 20
          }
        ]
      }
    ]
  }
}
```

The hook script curls `capture_thought` directly via the MCP HTTP API on every session end. It checks for a session summary JSON (written by a `createSessionSummary` skill or similar) and posts rich content if found, otherwise falls back to a basic session ping with project name, git branch, and timestamp.

See `~/.claude/scripts/mcp-session-hook.sh` for the reference implementation.

### Claude Desktop

Settings → Connectors → Add custom connector:
- Name: `PrivateMCP`
- URL: `https://<API_GATEWAY_URL>/mcp`
- Add header `x-api-key: <YOUR_API_KEY>`

### Cursor / VS Code (via mcp-remote)

```json
{
  "mcpServers": {
    "private-mcp": {
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

## Security

### Authentication

All API endpoints require an API Gateway API key (`x-api-key` header), except the Slack webhook (`/slack/events`), which is publicly accessible but verified via signature.

### Slack Webhook Verification

Incoming Slack requests are verified using HMAC-SHA256 signature validation with the `SLACK_SIGNING_SECRET` (stored in `.env`). Includes replay protection — requests with timestamps older than 5 minutes are rejected.

### CORS

CORS is restricted to `http://localhost:5173` and `http://localhost:3000` by default. To allow additional origins (e.g., a CloudFront distribution for a deployed UI), set the `ALLOWED_ORIGINS` environment variable in `.env` as a comma-separated list.

### Input Validation

All REST API endpoints validate input:

- Thought IDs must be valid UUIDs
- Dates must match `YYYY-MM-DD` format
- Text fields capped at 10,000 characters
- Query strings capped at 1,000 characters
- Result count parameters have upper-bound caps
- Type and source fields validated against allowed enums
- Request body size capped at 50KB

### Secrets Management

Slack tokens (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`) are stored in `.env` (gitignored) and passed as Lambda environment variables at deploy time. For multi-user AWS accounts, consider migrating to AWS Secrets Manager.

### IAM

Lambda execution roles follow least-privilege: scoped to the specific S3 Vectors bucket and required Bedrock model ARNs.

### Logging and Alarms

API Gateway access logs are sent to CloudWatch with 30-day retention. All Lambda handlers use structured error logging. To enable a CloudWatch alarm on 5xx errors (via SNS email notification), set `ALERT_EMAIL` in `.env`.

## Project Structure

```
private-mcp/
├── infra/
│   ├── bin/app.ts                    # CDK app entry
│   └── lib/
│       ├── config/index.ts           # Account ID, region, tags
│       └── stacks/
│           └── private-mcp-stack.ts
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

### MCP tools missing in some projects

If MCP tools work in one project but not another, the server was registered with `--scope local` (the default) instead of `--scope user`. Fix by re-registering:

```bash
claude mcp remove private-mcp --scope local
claude mcp add --transport http --scope user private-mcp \
  https://<API_GATEWAY_URL>/mcp \
  --header "x-api-key: <YOUR_API_KEY>"
```

### Daily summary shows zero activity

The daily summary reports on the previous day's thoughts. If zero thoughts were captured, check:
1. MCP server is registered at `--scope user` (see above)
2. AWS SSO token hasn't expired (run `aws sso login --profile private-mcp`)
3. The SessionEnd hook is configured and the script is executable

### Duplicate Slack replies

Slack retries webhook delivery after 3 seconds. If the full pipeline (embed + classify + store) takes longer, you get duplicate captures. This is cosmetic — the captures are identical.
