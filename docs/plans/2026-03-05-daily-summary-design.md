# Daily Summary Feature — Design

## Overview

A daily summary report posted to Slack with MCP performance metrics and content highlights. Triggered on a schedule (EventBridge) and available on demand via an MCP tool.

## Architecture

New Lambda (`daily-summary`) with two trigger paths:

- **EventBridge scheduled rule** — cron at configurable hour (from `.env`)
- **MCP tool** (`daily_summary`) — on-demand via mcp-server Lambda invoking daily-summary synchronously

### Data Flow

```
EventBridge (cron) ──▶ daily-summary Lambda
                            │
MCP tool ──────────▶ daily-summary Lambda
                            │
                            ├── S3 Vectors (ListVectors for today's thoughts)
                            ├── S3 Vectors (GetVectors for metadata)
                            │
                            ▼
                      Format report
                            │
                            ▼
                      Slack (chat.postMessage)
```

## Report Format

```
Daily Summary — March 5, 2026

Performance
- 12 thoughts captured (8 slack, 4 mcp)
- Types: 4 observations, 3 tasks, 2 ideas, 2 decisions, 1 milestone
- Total stored: 247

Highlights
- Decisions: [list actual content]
- Action items: [list actual content]
- Milestones: [list actual content]
- People mentioned: Alex, Jamie
```

Two sections:

1. **Performance** — count of thoughts captured today, breakdown by type and source, total stored count
2. **Highlights** — decisions, action items, and milestones with actual content; people mentioned

## Configuration

Added to `.env`:

```
DAILY_SUMMARY_HOUR=18
DAILY_SUMMARY_TIMEZONE=America/Los_Angeles
```

Future: configurable via web UI backed by a DynamoDB settings table. For now, env vars are sufficient for a single-user system.

## Lambda Details

- **Name**: daily-summary
- **Runtime**: Node.js 22, 256MB, 30s timeout
- **Self-contained**: own `functions/` directory following existing Lambda pattern
- **IAM**: S3 Vectors read access (ListVectors, GetVectors, QueryVectors)
- **Environment variables**: vector bucket/index, Slack bot token, Slack capture channel, summary hour/timezone

## MCP Integration

New `daily_summary` tool registered on mcp-server:

- Invokes daily-summary Lambda synchronously (`RequestResponse`)
- Returns the report text to the MCP caller
- Also posts to Slack (same as scheduled run)

## CDK Resources

- **Lambda**: `NodejsFunction` at `lambdas/daily-summary/index.ts`
- **EventBridge rule**: `events.Rule` with `schedule.cron()` using hour/timezone from env
- **IAM**: S3 Vectors read policy, Lambda invoke grant from mcp-server
- **Lambda invoke grant**: mcp-server granted invoke permission on daily-summary

## Source Layout

```
lambdas/
└── daily-summary/
    ├── index.ts                  # Handler: gather data, format, post to Slack
    └── functions/
        ├── getTodaysThoughts.ts  # ListVectors + GetVectors for today's date range
        ├── getStats.ts           # Total count across all time
        ├── formatReport.ts       # Build Slack message text
        └── postToSlack.ts        # Post message to Slack channel
```
