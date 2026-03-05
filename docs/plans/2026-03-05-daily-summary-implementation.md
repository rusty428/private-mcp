# Daily Summary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a daily-summary Lambda that posts a performance + highlights report to Slack, triggered by EventBridge schedule and available on-demand via MCP tool.

**Architecture:** New `daily-summary` Lambda reads all thoughts from S3 Vectors, filters to today's date, builds a two-section report (performance metrics + content highlights), and posts to Slack. EventBridge cron rule triggers it daily. The existing `mcp-server` Lambda gets a new `daily_summary` tool that invokes it synchronously.

**Tech Stack:** CDK v2, Node.js 22 Lambda, EventBridge, S3 Vectors, Slack Web API

---

### Task 1: Add .env config for daily summary schedule

**Files:**
- Modify: `.env` (add two vars)

**Step 1: Add schedule config to .env**

Add to the existing `.env` file:

```
DAILY_SUMMARY_HOUR=18
DAILY_SUMMARY_TIMEZONE=America/Los_Angeles
```

**Step 2: Commit**

```bash
git add .env
```

Note: `.env` is gitignored, so this won't actually commit — but the values are now available for CDK synth.

---

### Task 2: Create daily-summary Lambda — getTodaysThoughts

**Files:**
- Create: `lambdas/daily-summary/functions/getTodaysThoughts.ts`

**Step 1: Create getTodaysThoughts function**

This function lists all vectors, fetches metadata, and filters to today's date in the configured timezone.

```typescript
import { S3VectorsClient, ListVectorsCommand, GetVectorsCommand } from '@aws-sdk/client-s3vectors';
import { ThoughtMetadata } from '../../../types/thought';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });

interface ThoughtWithKey {
  key: string;
  metadata: ThoughtMetadata;
}

export async function getTodaysThoughts(todayDateStr: string): Promise<ThoughtWithKey[]> {
  const listResponse = await s3vectors.send(new ListVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
  }));

  if (!listResponse.vectors || listResponse.vectors.length === 0) return [];

  const keys = listResponse.vectors.map((v: any) => v.key);

  // GetVectors supports max 100 keys per call — batch if needed
  const allThoughts: ThoughtWithKey[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    const getResponse = await s3vectors.send(new GetVectorsCommand({
      vectorBucketName: process.env.VECTOR_BUCKET_NAME,
      indexName: process.env.VECTOR_INDEX_NAME,
      keys: batch,
      returnMetadata: true,
    }));

    if (getResponse.vectors) {
      for (const v of getResponse.vectors) {
        const meta = v.metadata as unknown as ThoughtMetadata;
        if (meta?.created_at?.startsWith(todayDateStr)) {
          allThoughts.push({ key: v.key!, metadata: meta });
        }
      }
    }
  }

  return allThoughts;
}
```

**Step 2: Commit**

```bash
git add lambdas/daily-summary/functions/getTodaysThoughts.ts
git commit -m "feat(daily-summary): add getTodaysThoughts function"
```

---

### Task 3: Create daily-summary Lambda — getTotalCount

**Files:**
- Create: `lambdas/daily-summary/functions/getTotalCount.ts`

**Step 1: Create getTotalCount function**

Simple count of all vectors in the index.

```typescript
import { S3VectorsClient, ListVectorsCommand } from '@aws-sdk/client-s3vectors';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });

export async function getTotalCount(): Promise<number> {
  const listResponse = await s3vectors.send(new ListVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
  }));

  return listResponse.vectors?.length ?? 0;
}
```

**Step 2: Commit**

```bash
git add lambdas/daily-summary/functions/getTotalCount.ts
git commit -m "feat(daily-summary): add getTotalCount function"
```

---

### Task 4: Create daily-summary Lambda — formatReport

**Files:**
- Create: `lambdas/daily-summary/functions/formatReport.ts`

**Step 1: Create formatReport function**

Builds the Slack message from today's thoughts and total count.

```typescript
import { ThoughtMetadata } from '../../../types/thought';

interface ThoughtWithKey {
  key: string;
  metadata: ThoughtMetadata;
}

interface DailySummaryReport {
  text: string;
  thoughtCount: number;
  dateStr: string;
}

export function formatReport(
  todayDateStr: string,
  thoughts: ThoughtWithKey[],
  totalCount: number
): DailySummaryReport {
  const count = thoughts.length;

  if (count === 0) {
    return {
      text: `*Daily Summary — ${todayDateStr}*\n\nNo thoughts captured today. Total stored: ${totalCount}`,
      thoughtCount: 0,
      dateStr: todayDateStr,
    };
  }

  // Performance: count by type and source
  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const decisions: string[] = [];
  const actionItems: string[] = [];
  const milestones: string[] = [];
  const peopleSet = new Set<string>();

  for (const t of thoughts) {
    const m = t.metadata;
    byType[m.type] = (byType[m.type] || 0) + 1;
    bySource[m.source] = (bySource[m.source] || 0) + 1;

    if (m.type === 'decision') decisions.push(m.content);
    if (m.type === 'milestone') milestones.push(m.content);
    for (const ai of m.action_items) actionItems.push(ai);
    for (const p of m.people) peopleSet.add(p);
  }

  // Build source breakdown string
  const sourceStr = Object.entries(bySource)
    .map(([src, n]) => `${n} ${src}`)
    .join(', ');

  // Build type breakdown string
  const typeStr = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${n} ${type}`)
    .join(', ');

  let text = `*Daily Summary — ${todayDateStr}*\n\n`;
  text += `*Performance*\n`;
  text += `• ${count} thoughts captured (${sourceStr})\n`;
  text += `• Types: ${typeStr}\n`;
  text += `• Total stored: ${totalCount}\n`;

  // Highlights section — only if there's something to highlight
  const hasHighlights = decisions.length > 0 || actionItems.length > 0 || milestones.length > 0 || peopleSet.size > 0;
  if (hasHighlights) {
    text += `\n*Highlights*\n`;
    if (decisions.length > 0) {
      text += `• Decisions: ${decisions.join('; ')}\n`;
    }
    if (actionItems.length > 0) {
      text += `• Action items: ${actionItems.join('; ')}\n`;
    }
    if (milestones.length > 0) {
      text += `• Milestones: ${milestones.join('; ')}\n`;
    }
    if (peopleSet.size > 0) {
      text += `• People mentioned: ${[...peopleSet].join(', ')}\n`;
    }
  }

  return { text, thoughtCount: count, dateStr: todayDateStr };
}
```

**Step 2: Commit**

```bash
git add lambdas/daily-summary/functions/formatReport.ts
git commit -m "feat(daily-summary): add formatReport function"
```

---

### Task 5: Create daily-summary Lambda — postToSlack

**Files:**
- Create: `lambdas/daily-summary/functions/postToSlack.ts`

**Step 1: Create postToSlack function**

Posts a message to the Slack channel (not a thread reply — this is a top-level message).

```typescript
export async function postToSlack(channel: string, botToken: string, text: string): Promise<void> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text }),
  });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.status}`);
  }
}
```

**Step 2: Commit**

```bash
git add lambdas/daily-summary/functions/postToSlack.ts
git commit -m "feat(daily-summary): add postToSlack function"
```

---

### Task 6: Create daily-summary Lambda — handler

**Files:**
- Create: `lambdas/daily-summary/index.ts`

**Step 1: Create the handler**

The handler computes today's date in the configured timezone, gathers data, formats the report, and posts to Slack. Returns the report text so callers (MCP tool) can use it.

```typescript
import { getTodaysThoughts } from './functions/getTodaysThoughts';
import { getTotalCount } from './functions/getTotalCount';
import { formatReport } from './functions/formatReport';
import { postToSlack } from './functions/postToSlack';

interface DailySummaryResult {
  text: string;
  thoughtCount: number;
  dateStr: string;
}

export const handler = async (): Promise<DailySummaryResult> => {
  // Compute today's date in configured timezone
  const timezone = process.env.DAILY_SUMMARY_TIMEZONE || 'America/Los_Angeles';
  const now = new Date();
  const todayDateStr = now.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD format

  const [thoughts, totalCount] = await Promise.all([
    getTodaysThoughts(todayDateStr),
    getTotalCount(),
  ]);

  const report = formatReport(todayDateStr, thoughts, totalCount);

  const channel = process.env.SLACK_CAPTURE_CHANNEL;
  const botToken = process.env.SLACK_BOT_TOKEN;

  if (channel && botToken) {
    await postToSlack(channel, botToken, report.text);
  }

  return report;
};
```

**Step 2: Commit**

```bash
git add lambdas/daily-summary/index.ts
git commit -m "feat(daily-summary): add Lambda handler"
```

---

### Task 7: Add daily-summary Lambda + EventBridge rule to CDK stack

**Files:**
- Modify: `infra/lib/stacks/aws-private-mcp-stack.ts`

**Step 1: Add imports**

Add `events` and `events_targets` imports at the top of the file alongside existing imports:

```typescript
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
```

**Step 2: Add daily-summary Lambda after the mcp-server Lambda block (~line 138)**

Add this block after `mcpServerFn.addToRolePolicy(bedrockPolicy);`:

```typescript
    // --- daily-summary Lambda ---
    const dailySummaryFn = new nodejs.NodejsFunction(this, 'DailySummaryFn', {
      entry: 'lambdas/daily-summary/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        ...commonEnv,
        SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN || '',
        SLACK_CAPTURE_CHANNEL: process.env.SLACK_CAPTURE_CHANNEL || '',
        DAILY_SUMMARY_TIMEZONE: process.env.DAILY_SUMMARY_TIMEZONE || 'America/Los_Angeles',
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });
    dailySummaryFn.addToRolePolicy(s3VectorsPolicy);

    // EventBridge scheduled rule for daily summary
    const summaryHour = process.env.DAILY_SUMMARY_HOUR || '18';
    new events.Rule(this, 'DailySummarySchedule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: summaryHour,
        month: '*',
        weekDay: '*',
        year: '*',
      }),
      targets: [new targets.LambdaFunction(dailySummaryFn)],
    });

    // Allow mcp-server to invoke daily-summary
    dailySummaryFn.grantInvoke(mcpServerFn);
```

**Step 3: Add DAILY_SUMMARY_FN_NAME to mcp-server environment**

In the mcpServerFn definition, add to the environment block:

```typescript
        DAILY_SUMMARY_FN_NAME: dailySummaryFn.functionName,
```

Note: the dailySummaryFn must be defined before mcpServerFn references it, OR move the env var addition after dailySummaryFn is created using `mcpServerFn.addEnvironment('DAILY_SUMMARY_FN_NAME', dailySummaryFn.functionName)`. Since dailySummaryFn is defined after mcpServerFn, use `addEnvironment`.

**Step 4: Commit**

```bash
git add infra/lib/stacks/aws-private-mcp-stack.ts
git commit -m "feat(daily-summary): add Lambda + EventBridge rule to CDK stack"
```

---

### Task 8: Add daily_summary MCP tool to mcp-server

**Files:**
- Create: `lambdas/mcp-server/functions/invokeDailySummary.ts`
- Modify: `lambdas/mcp-server/server.ts`

**Step 1: Create invokeDailySummary function**

```typescript
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({ region: process.env.REGION });

interface DailySummaryResult {
  text: string;
  thoughtCount: number;
  dateStr: string;
}

export async function invokeDailySummary(): Promise<DailySummaryResult> {
  const response = await lambda.send(new InvokeCommand({
    FunctionName: process.env.DAILY_SUMMARY_FN_NAME,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({})),
  }));

  const payload = JSON.parse(new TextDecoder().decode(response.Payload));

  if (response.FunctionError) {
    throw new Error(`daily-summary error: ${JSON.stringify(payload)}`);
  }

  return payload;
}
```

**Step 2: Register the tool in server.ts**

Add import at the top:

```typescript
import { invokeDailySummary } from './functions/invokeDailySummary';
```

Add this tool registration after the `capture_thought` tool block (before `return server;`):

```typescript
  server.registerTool(
    'daily_summary',
    {
      title: 'Daily Summary',
      description: 'Generate and post today\'s daily summary to Slack. Returns the summary text.',
    },
    async () => {
      const result = await invokeDailySummary();
      return {
        content: [{ type: 'text' as const, text: result.text }],
      };
    }
  );
```

**Step 3: Commit**

```bash
git add lambdas/mcp-server/functions/invokeDailySummary.ts lambdas/mcp-server/server.ts
git commit -m "feat(daily-summary): add daily_summary MCP tool"
```

---

### Task 9: Synth, deploy, and verify

**Files:** None (infrastructure commands only)

**Step 1: Run CDK synth**

```bash
pnpm synth
```

Expected: Clean synthesis, no errors. Verify the new Lambda and EventBridge rule appear in the template.

**Step 2: Deploy**

```bash
npx cdk deploy AWSPrivateMCPStack --profile private-mcp --require-approval never
```

Expected: Stack update with new Lambda, EventBridge rule, and IAM permissions.

**Step 3: Test on-demand via MCP**

Use the `daily_summary` MCP tool from Claude Code. Verify it returns a report and posts to Slack.

**Step 4: Commit any adjustments**

If any fixes were needed during testing, commit them.

---

### Task 10: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the following sections:**

- **Source Layout**: Add `daily-summary/` Lambda and its functions
- **Lambda Architecture**: Add daily-summary description
- **MCP Tools**: Add `daily_summary` tool to the table
- **CDK Conventions**: Note EventBridge schedule from `.env`

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for daily-summary feature"
```
