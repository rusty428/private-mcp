# Developer Guide

## Prerequisites

- Node.js 22+
- npm (Node.js 22+ includes npm)
- AWS CLI v2 with [SSO configured](https://docs.aws.amazon.com/cli/latest/userguide/sso-configure-profile-token.html)
- AWS CDK CLI (`npm install -g aws-cdk`)
- **Bedrock model access** — enable these models in the [Bedrock console](https://console.aws.amazon.com/bedrock/home#/modelaccess) for your region:
  - Amazon Titan Text Embeddings v2
  - Anthropic Claude 3 Haiku

## Setup

```bash
git clone https://github.com/rusty428/private-mcp.git
cd private-mcp
npm install
```

## Commands

```bash
npm run build          # TypeScript compile
npm run synth          # Generate CloudFormation template
npm run diff           # Preview infrastructure changes
npm run deploy         # Deploy (use npx cdk deploy directly to pass --profile)
```

## Configuration

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

All deployment config lives in `.env` — your AWS account ID, region, and optional settings (Slack integration, daily summary schedule, CORS origins, alert email). See `.env.example` for descriptions of each variable.

Authenticate via SSO:

```bash
aws sso login
aws sts get-caller-identity --profile <your-profile>
```

## Deploying

All configuration comes from `.env` (no CDK context flags needed). First-time deployers to a new AWS account must bootstrap CDK:

```bash
npx cdk bootstrap --profile <your-profile>
```

Then deploy:

```bash
npx cdk deploy PrivateMCPStack --profile <your-profile>
```

### Deploy Outputs

After deployment, CDK outputs:

- **MCPEndpointUrl** — MCP server endpoint for AI tool connections
- **ApiUrl** — Base API Gateway URL
- **ApiKeyId** — Retrieve the actual key value with:

```bash
aws apigateway get-api-key --api-key <API_KEY_ID> --include-value --profile <your-profile>
```

- **SlackWebhookUrl** — URL for Slack Event Subscriptions (if using Slack integration)

## Web UI

The web dashboard runs as a Vite + React app (Cloudscape Design System).

### Local development

```bash
npm run mcp-ui
```

Open `http://localhost:5173`. The UI connects to the REST API via API Gateway. Set your API Gateway URL and API key in `ui/.env.local`:

```bash
cp ui/.env.example ui/.env.local
```

### Production deployment

Build the static assets and host them on S3 + CloudFront (or any static hosting):

```bash
npm run build --prefix ui
```

Output is in `ui/dist/`. If deploying behind a custom domain, add the origin to `ALLOWED_ORIGINS` in your `.env` to enable CORS, then redeploy the stack.

## Connecting AI Tools

### Claude Code

Use `headersHelper` (not static `--header`) to avoid Claude Code's OAuth detection triggering "needs authentication" on HTTP servers.

**1. Create a headers helper script** (e.g. `~/.claude/scripts/private-mcp-headers.sh`):

```bash
#!/bin/bash
echo '{"x-api-key": "<YOUR_API_KEY>"}'
```

Make it executable: `chmod +x ~/.claude/scripts/private-mcp-headers.sh`

**2. Register the server:**

```bash
claude mcp add-json --scope user private-mcp \
  '{"type":"http","url":"https://<API_GATEWAY_URL>/mcp","headersHelper":"~/.claude/scripts/private-mcp-headers.sh"}'
```

**The `--scope user` flag is critical.** Without it, the MCP server is only registered for the current project directory. With `--scope user`, the MCP tools are available in every Claude Code session regardless of which project you're working in. Available scopes:

| Scope | Registered in | Available in |
|---|---|---|
| `local` (default) | `.claude.json` per project path | Only that project directory |
| `project` | `.claude/settings.json` in repo | Anyone who clones the repo |
| `user` | `~/.claude.json` | All projects on your machine |

### Claude Code Hooks (optional, recommended)

Three hook scripts in the `hooks/` directory automate thought capture throughout a session:

| Hook | Event | Purpose |
|---|---|---|
| `mcp-session-start.sh` | SessionStart | Exposes `session_id` to Claude so it includes it in every `capture_thought` call |
| `mcp-session-hook.sh` | SessionEnd | Captures a session summary (or basic ping) via the MCP HTTP API |
| `mcp-prompt-capture.sh` | UserPromptSubmit | Captures every user prompt as a thought with session context |

#### Setup

1. Copy the hook scripts to `~/.claude/scripts/`:

```bash
cp hooks/*.sh ~/.claude/scripts/
chmod +x ~/.claude/scripts/mcp-*.sh
```

2. Edit each script and fill in the configuration section with your deployment values:

```bash
MCP_ENDPOINT=""   # e.g. https://<api-id>.execute-api.<region>.amazonaws.com/api/mcp
API_KEY_ID=""     # API Gateway key ID from deploy output
AWS_PROFILE=""    # AWS CLI profile name
AWS_REGION=""     # e.g. us-west-2
```

Note: `mcp-session-start.sh` does not need these values (it only outputs text to Claude).

3. Register the hooks in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/scripts/mcp-session-start.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/scripts/mcp-prompt-capture.sh",
            "timeout": 20
          }
        ]
      }
    ],
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

#### How session_id tracking works

Claude Code provides a `session_id` in the JSON payload sent to hooks via stdin. The **SessionStart** hook extracts this ID and displays it to Claude, which then includes it in every `capture_thought` call during the session. The **SessionEnd** and **UserPromptSubmit** hooks extract it directly and pass it to the MCP API. This means every thought -- whether captured by Claude, by a hook, or by user prompts -- is linked to the originating session.

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

## Slack Integration (optional)

Slack is an optional capture source. Skip this section if you only plan to use MCP tools and the web UI.

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

### Add Slack credentials to `.env`

Add these values to your `.env` and redeploy:

```
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_CAPTURE_CHANNEL=your-channel-id
```

## Security

### Authentication

All API endpoints require an API Gateway API key (`x-api-key` header). The Slack webhook (`/slack/events`), if enabled, is publicly accessible but verified via HMAC-SHA256 signature with replay protection (5-minute window).

### CORS

Any `http://localhost:*` origin is allowed automatically for local development. To allow additional origins (e.g., a CloudFront distribution for a deployed UI), set the `ALLOWED_ORIGINS` environment variable in `.env` as a comma-separated list.

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

Secrets (Slack tokens, if using Slack integration) are stored in `.env` (gitignored) and passed as Lambda environment variables at deploy time. For multi-user AWS accounts, consider migrating to AWS Secrets Manager.

### IAM

Lambda execution roles follow least-privilege: scoped to the specific S3 Vectors bucket and required Bedrock model ARNs.

### Logging and Alarms

API Gateway access logs are sent to CloudWatch with 30-day retention. All Lambda handlers use structured error logging. To enable a CloudWatch alarm on 5xx errors (via SNS email notification), set `ALERT_EMAIL` in `.env`.

## Project Structure

```
private-mcp/
├── hooks/
│   ├── mcp-session-start.sh          # SessionStart hook template
│   ├── mcp-session-hook.sh           # SessionEnd hook template
│   └── mcp-prompt-capture.sh         # UserPromptSubmit hook template
├── infra/
│   ├── bin/app.ts                    # CDK app entry
│   └── lib/
│       ├── config/index.ts           # Account ID, region, tags
│       └── stacks/
│           └── private-mcp-stack.ts
├── lambdas/
│   ├── process-thought/              # Core: embed + classify + store
│   ├── mcp-server/                   # MCP protocol server
│   ├── rest-api/                     # REST backend for web UI
│   ├── daily-summary/                # Daily report (EventBridge scheduled)
│   ├── enrich-thought/               # Async enrichment pipeline
│   └── ingest-thought/               # Slack webhook handler (optional)
├── scripts/
│   └── migrate-to-dynamodb.ts        # One-time migration (not needed for fresh installs)
├── types/
│   ├── thought.ts                    # Domain types
│   └── config.ts                     # Constants (bucket, index, model IDs)
├── ui/                               # Web dashboard (Vite + React + Cloudscape)
└── docs/images/                      # README screenshots
```

### Lambda Convention

Each Lambda is self-contained under `lambdas/<name>/`:

- `index.ts` — Handler. Thin orchestration only.
- `functions/` — Business logic specific to this Lambda.
- `utils/` — Generic utilities (duplicated across Lambdas by design).

One function per file. File name matches the exported function name.

## Troubleshooting

### Check Lambda logs

```bash
# List log groups
aws logs describe-log-groups --profile <your-profile> --region us-west-2

# Tail a specific Lambda's logs
aws logs tail "/aws/lambda/<function-name>" --since 5m --profile <your-profile> --region us-west-2
```

### MCP tools missing in some projects

If MCP tools work in one project but not another, the server was registered with `--scope local` (the default) instead of `--scope user`. Fix by re-registering:

```bash
claude mcp remove private-mcp --scope local
claude mcp add-json --scope user private-mcp \
  '{"type":"http","url":"https://<API_GATEWAY_URL>/mcp","headersHelper":"~/.claude/scripts/private-mcp-headers.sh"}'
```

### S3 Vectors empty array error

S3 Vectors does not allow empty arrays in metadata. The `storeThought` function filters these out. If you add new array fields to metadata, apply the same pattern.

### Daily summary shows zero activity

The daily summary reports on the previous day's thoughts. If zero thoughts were captured, check:
1. MCP server is registered at `--scope user` (see above)
2. AWS SSO token hasn't expired (run `aws sso login --profile <your-profile>`)
3. The SessionEnd hook is configured and the script is executable

### Slack messages not triggering the function

- Verify both `message.channels` and `message.groups` are subscribed in Event Subscriptions
- Confirm the bot is invited to the channel
- Check the channel ID matches the `SLACK_CAPTURE_CHANNEL` in `.env`

### Duplicate Slack replies

Slack retries webhook delivery after 3 seconds. If the full pipeline (embed + classify + store) takes longer, you get duplicate captures. This is cosmetic — the captures are identical.
