# AWSPrivateMCP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a private MCP server on AWS that captures, embeds, classifies, and semantically searches personal thoughts — all data stays within a dedicated AWS account.

**Architecture:** Three Lambda functions (process-thought, ingest-thought, mcp-server) behind API Gateway, using S3 Vectors for storage, Bedrock Titan v2 for embeddings, and Bedrock Claude Haiku for metadata extraction. Slack webhook for capture, MCP protocol for AI tool integration.

**Tech Stack:** CDK v2 (TypeScript), Lambda (Node.js 22, esbuild), S3 Vectors (`@aws-sdk/client-s3vectors`), Bedrock Runtime, API Gateway REST API, MCP SDK (`@modelcontextprotocol/server` + `@modelcontextprotocol/node`), Express + `@codegenie/serverless-express`, pnpm.

---

## Task 1: Initialize the Repository

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `cdk.json`
- Create: `.gitignore`
- Create: `infra/bin/app.ts`
- Create: `infra/lib/config/index.ts`
- Create: `types/thought.ts`
- Create: `types/config.ts`

**Step 1: Initialize git repo**

```bash
cd ~/projects/AWSPrivateMCP/aws-private-mcp-infra
git init
```

**Step 2: Create package.json**

```json
{
  "name": "aws-private-mcp-infra",
  "version": "0.0.1",
  "private": true,
  "description": "AWSPrivateMCP - Private MCP server infrastructure & backend",
  "scripts": {
    "build": "tsc",
    "synth": "cdk synth",
    "deploy": "cdk deploy",
    "diff": "cdk diff",
    "lint": "eslint . --ext .ts --fix",
    "test": "jest"
  },
  "dependencies": {
    "aws-cdk-lib": "^2.170.0",
    "constructs": "^10.0.0",
    "@aws-sdk/client-s3vectors": "^3.700.0",
    "@aws-sdk/client-bedrock-runtime": "^3.700.0",
    "@aws-sdk/client-lambda": "^3.700.0",
    "@modelcontextprotocol/server": "^1.24.0",
    "@modelcontextprotocol/node": "^1.24.0",
    "zod": "^3.23.0",
    "express": "^4.21.0",
    "@codegenie/serverless-express": "^4.15.0",
    "source-map-support": "^0.5.21"
  },
  "devDependencies": {
    "aws-cdk": "^2.1108.0",
    "typescript": "~5.6.0",
    "ts-node": "^10.9.0",
    "esbuild": "^0.27.3",
    "@types/node": "^22.0.0",
    "@types/aws-lambda": "^8.10.0",
    "@types/express": "^4.17.0"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "esbuild",
      "@esbuild/darwin-arm64"
    ]
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "declaration": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "paths": {
      "@types/*": ["./types/*"]
    }
  },
  "include": [
    "infra/**/*.ts",
    "lambdas/**/*.ts",
    "types/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "cdk.out"
  ]
}
```

**Step 4: Create cdk.json**

```json
{
  "app": "npx ts-node --prefer-ts-exts infra/bin/app.ts",
  "watch": {
    "include": ["infra/**"],
    "exclude": [
      "README.md",
      "cdk*.json",
      "**/*.d.ts",
      "**/*.js",
      "node_modules",
      "dist",
      "cdk.out"
    ]
  },
  "context": {
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true,
    "@aws-cdk/core:target-partitions": ["aws"],
    "@aws-cdk/aws-iam:minimizePolicies": true
  }
}
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
cdk.out/
*.js
*.d.ts
*.js.map
!cdk.json
!package.json
!tsconfig.json
pnpm-lock.yaml
.env
```

**Step 6: Create types/config.ts**

```typescript
export const VECTOR_BUCKET_NAME = 'aws-private-mcp-thoughts';
export const VECTOR_INDEX_NAME = 'thoughts';
export const VECTOR_DIMENSIONS = 1024;
export const EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0';
export const CLASSIFICATION_MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';
```

**Step 7: Create types/thought.ts**

```typescript
export type ThoughtType = 'observation' | 'task' | 'idea' | 'reference' | 'person_note';

export interface ThoughtMetadata {
  content: string;
  type: ThoughtType;
  topics: string[];
  people: string[];
  action_items: string[];
  dates_mentioned: string[];
  source: 'slack' | 'mcp' | 'api';
  source_ref?: string;
  created_at: string;
}

export interface ProcessThoughtInput {
  text: string;
  source: 'slack' | 'mcp' | 'api';
  sourceRef?: string;
}

export interface ProcessThoughtResult {
  id: string;
  type: ThoughtType;
  topics: string[];
  people: string[];
  action_items: string[];
  created_at: string;
}

export interface ThoughtSearchResult {
  key: string;
  distance: number;
  metadata: ThoughtMetadata;
}
```

**Step 8: Create infra/lib/config/index.ts**

```typescript
export interface AWSPrivateMCPConfig {
  accountId: string;
  region: string;
  applicationId: string;
  tags: Record<string, string>;
}

export const config: AWSPrivateMCPConfig = {
  accountId: '', // SET AFTER ACCOUNT CREATION
  region: 'us-west-2',
  applicationId: 'aws-private-mcp',
  tags: {
    Project: 'AWSPrivateMCP',
    ManagedBy: 'cdk',
  },
};
```

**Step 9: Create infra/bin/app.ts** (minimal scaffold)

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { config } from '../lib/config';

const app = new cdk.App();

const env = {
  account: config.accountId,
  region: config.region,
};

// Stacks will be added in Task 3

Object.entries(config.tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});
```

**Step 10: Install dependencies and commit**

```bash
cd ~/projects/AWSPrivateMCP/aws-private-mcp-infra
pnpm install
git add package.json tsconfig.json cdk.json .gitignore types/ infra/
git commit -m "feat: initialize aws-private-mcp-infra project"
```

---

## Task 2: Build the process-thought Lambda

The core Lambda — takes raw text, embeds via Bedrock Titan v2, classifies via Bedrock Haiku, writes to S3 Vectors.

**Files:**
- Create: `lambdas/process-thought/index.ts`
- Create: `lambdas/process-thought/functions/generateEmbedding.ts`
- Create: `lambdas/process-thought/functions/classifyThought.ts`
- Create: `lambdas/process-thought/functions/storeThought.ts`
- Create: `lambdas/process-thought/utils/createResponse.ts`

**Step 1: Create lambdas/process-thought/utils/createResponse.ts**

```typescript
import { APIGatewayProxyResult } from 'aws-lambda';

export function createResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}
```

**Step 2: Create lambdas/process-thought/functions/generateEmbedding.ts**

```typescript
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { EMBEDDING_MODEL_ID, VECTOR_DIMENSIONS } from '../../../types/config';

const bedrock = new BedrockRuntimeClient({ region: process.env.REGION });

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await bedrock.send(new InvokeModelCommand({
    modelId: EMBEDDING_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      inputText: text,
      dimensions: VECTOR_DIMENSIONS,
      normalize: true,
    }),
  }));

  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.embedding;
}
```

**Step 3: Create lambdas/process-thought/functions/classifyThought.ts**

```typescript
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { CLASSIFICATION_MODEL_ID } from '../../../types/config';
import { ThoughtType } from '../../../types/thought';

const bedrock = new BedrockRuntimeClient({ region: process.env.REGION });

interface ClassificationResult {
  type: ThoughtType;
  topics: string[];
  people: string[];
  action_items: string[];
  dates_mentioned: string[];
}

const SYSTEM_PROMPT = `Extract metadata from the user's captured thought. Return JSON with:
- "people": array of people mentioned (empty if none)
- "action_items": array of implied to-dos (empty if none)
- "dates_mentioned": array of dates YYYY-MM-DD (empty if none)
- "topics": array of 1-3 short topic tags (always at least one)
- "type": one of "observation", "task", "idea", "reference", "person_note"
Only extract what's explicitly there. Return valid JSON only.`;

export async function classifyThought(text: string): Promise<ClassificationResult> {
  const response = await bedrock.send(new InvokeModelCommand({
    modelId: CLASSIFICATION_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 512,
      messages: [
        { role: 'user', content: text },
      ],
      system: SYSTEM_PROMPT,
    }),
  }));

  const result = JSON.parse(new TextDecoder().decode(response.body));
  const content = result.content[0].text;

  try {
    return JSON.parse(content);
  } catch {
    return {
      type: 'observation',
      topics: ['uncategorized'],
      people: [],
      action_items: [],
      dates_mentioned: [],
    };
  }
}
```

**Step 4: Create lambdas/process-thought/functions/storeThought.ts**

```typescript
import { S3VectorsClient, PutVectorsCommand } from '@aws-sdk/client-s3vectors';
import { ThoughtMetadata } from '../../../types/thought';
import { VECTOR_BUCKET_NAME, VECTOR_INDEX_NAME } from '../../../types/config';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });

export async function storeThought(
  id: string,
  embedding: number[],
  metadata: ThoughtMetadata
): Promise<void> {
  await s3vectors.send(new PutVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME || VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME || VECTOR_INDEX_NAME,
    vectors: [
      {
        key: id,
        data: { float32: embedding },
        metadata: {
          content: metadata.content,
          type: metadata.type,
          topics: metadata.topics,
          people: metadata.people,
          action_items: metadata.action_items,
          dates_mentioned: metadata.dates_mentioned,
          source: metadata.source,
          source_ref: metadata.source_ref || '',
          created_at: metadata.created_at,
        },
      },
    ],
  }));
}
```

**Step 5: Create lambdas/process-thought/index.ts**

```typescript
import { ProcessThoughtInput, ProcessThoughtResult, ThoughtMetadata } from '../../types/thought';
import { generateEmbedding } from './functions/generateEmbedding';
import { classifyThought } from './functions/classifyThought';
import { storeThought } from './functions/storeThought';
import { randomUUID } from 'crypto';

interface LambdaEvent {
  body?: string;
  source?: string;
  // Support both direct invocation and API Gateway
  text?: string;
  sourceRef?: string;
}

export const handler = async (event: LambdaEvent): Promise<ProcessThoughtResult> => {
  // Support direct Lambda invocation (from ingest-thought or mcp-server)
  const input: ProcessThoughtInput = event.text
    ? { text: event.text, source: (event.source as ProcessThoughtInput['source']) || 'api', sourceRef: event.sourceRef }
    : JSON.parse(event.body || '{}');

  if (!input.text || input.text.trim() === '') {
    throw new Error('Text is required');
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();

  const [embedding, classification] = await Promise.all([
    generateEmbedding(input.text),
    classifyThought(input.text),
  ]);

  const metadata: ThoughtMetadata = {
    content: input.text,
    type: classification.type,
    topics: classification.topics,
    people: classification.people,
    action_items: classification.action_items,
    dates_mentioned: classification.dates_mentioned,
    source: input.source,
    source_ref: input.sourceRef,
    created_at: createdAt,
  };

  await storeThought(id, embedding, metadata);

  return {
    id,
    type: classification.type,
    topics: classification.topics,
    people: classification.people,
    action_items: classification.action_items,
    created_at: createdAt,
  };
};
```

**Step 6: Commit**

```bash
git add lambdas/process-thought/
git commit -m "feat: add process-thought core Lambda"
```

---

## Task 3: Build the CDK Stack

**Files:**
- Create: `infra/lib/stacks/aws-private-mcp-stack.ts`
- Modify: `infra/bin/app.ts`

**Step 1: Create infra/lib/stacks/aws-private-mcp-stack.ts**

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { AWSPrivateMCPConfig } from '../config';
import {
  VECTOR_BUCKET_NAME,
  VECTOR_INDEX_NAME,
  VECTOR_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  CLASSIFICATION_MODEL_ID,
} from '../../../types/config';

interface AWSPrivateMCPStackProps extends cdk.StackProps {
  config: AWSPrivateMCPConfig;
}

export class AWSPrivateMCPStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AWSPrivateMCPStackProps) {
    super(scope, id, props);

    const { config } = props;

    // --- S3 Vectors ---
    // L1 construct for vector bucket and index
    // Note: CDK L2 constructs not yet available for S3 Vectors
    // The vector bucket and index must be created via SDK or CLI before first deploy
    // TODO: Add custom resource to create vector bucket + index, or document manual creation

    // --- Common Lambda environment ---
    const commonEnv = {
      REGION: config.region,
      VECTOR_BUCKET_NAME: VECTOR_BUCKET_NAME,
      VECTOR_INDEX_NAME: VECTOR_INDEX_NAME,
    };

    // --- S3 Vectors IAM policy ---
    const s3VectorsPolicy = new iam.PolicyStatement({
      actions: [
        's3vectors:PutVectors',
        's3vectors:QueryVectors',
        's3vectors:GetVectors',
        's3vectors:ListVectors',
        's3vectors:DeleteVectors',
      ],
      resources: [
        `arn:aws:s3vectors:${config.region}:${config.accountId}:vector-bucket/${VECTOR_BUCKET_NAME}/*`,
      ],
    });

    // --- Bedrock IAM policy ---
    const bedrockPolicy = new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:${config.region}::foundation-model/${EMBEDDING_MODEL_ID}`,
        `arn:aws:bedrock:${config.region}::foundation-model/${CLASSIFICATION_MODEL_ID}`,
      ],
    });

    // --- process-thought Lambda ---
    const processThoughtFn = new nodejs.NodejsFunction(this, 'ProcessThoughtFn', {
      entry: 'lambdas/process-thought/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });
    processThoughtFn.addToRolePolicy(s3VectorsPolicy);
    processThoughtFn.addToRolePolicy(bedrockPolicy);

    // --- ingest-thought Lambda ---
    const ingestThoughtFn = new nodejs.NodejsFunction(this, 'IngestThoughtFn', {
      entry: 'lambdas/ingest-thought/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        ...commonEnv,
        SLACK_BOT_TOKEN: this.node.tryGetContext('slackBotToken') || '',
        SLACK_CAPTURE_CHANNEL: this.node.tryGetContext('slackCaptureChannel') || '',
        PROCESS_THOUGHT_FN_NAME: processThoughtFn.functionName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });
    processThoughtFn.grantInvoke(ingestThoughtFn);

    // --- mcp-server Lambda ---
    const mcpServerFn = new nodejs.NodejsFunction(this, 'McpServerFn', {
      entry: 'lambdas/mcp-server/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        ...commonEnv,
        PROCESS_THOUGHT_FN_NAME: processThoughtFn.functionName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });
    processThoughtFn.grantInvoke(mcpServerFn);
    mcpServerFn.addToRolePolicy(s3VectorsPolicy);
    mcpServerFn.addToRolePolicy(bedrockPolicy);

    // --- API Gateway ---
    const api = new apigateway.RestApi(this, 'AWSPrivateMCPApi', {
      restApiName: 'AWSPrivateMCP',
      description: 'AWSPrivateMCP - Private MCP server API',
      deployOptions: {
        stageName: 'api',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
      },
    });

    // Slack webhook endpoint (public)
    const slackResource = api.root.addResource('slack').addResource('events');
    slackResource.addMethod('POST', new apigateway.LambdaIntegration(ingestThoughtFn));

    // MCP endpoint (API key secured)
    const mcpResource = api.root.addResource('mcp');

    // API Key + Usage Plan
    const apiKey = api.addApiKey('MCPApiKey', {
      apiKeyName: 'aws-private-mcp-key',
    });

    const usagePlan = api.addUsagePlan('MCPUsagePlan', {
      name: 'mcp-usage-plan',
      throttle: {
        rateLimit: 10,
        burstLimit: 20,
      },
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({ stage: api.deploymentStage });

    mcpResource.addMethod('POST', new apigateway.LambdaIntegration(mcpServerFn), {
      apiKeyRequired: true,
    });
    mcpResource.addMethod('GET', new apigateway.LambdaIntegration(mcpServerFn), {
      apiKeyRequired: true,
    });
    mcpResource.addMethod('DELETE', new apigateway.LambdaIntegration(mcpServerFn), {
      apiKeyRequired: true,
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'SlackWebhookUrl', {
      value: `${api.url}slack/events`,
      description: 'Slack webhook URL for Event Subscriptions',
    });

    new cdk.CfnOutput(this, 'MCPEndpointUrl', {
      value: `${api.url}mcp`,
      description: 'MCP server endpoint URL',
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API Key ID — retrieve value with: aws apigateway get-api-key --api-key <id> --include-value',
    });
  }
}
```

**Step 2: Update infra/bin/app.ts**

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { config } from '../lib/config';
import { AWSPrivateMCPStack } from '../lib/stacks/aws-private-mcp-stack';

const app = new cdk.App();

const env = {
  account: config.accountId,
  region: config.region,
};

new AWSPrivateMCPStack(app, 'AWSPrivateMCPStack', {
  env,
  config,
});

Object.entries(config.tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});
```

**Step 3: Commit**

```bash
git add infra/
git commit -m "feat: add CDK stack with API Gateway, Lambdas, S3 Vectors IAM"
```

---

## Task 4: Build the ingest-thought Lambda

**Files:**
- Create: `lambdas/ingest-thought/index.ts`
- Create: `lambdas/ingest-thought/functions/invokeProcessThought.ts`
- Create: `lambdas/ingest-thought/functions/replyInSlack.ts`
- Create: `lambdas/ingest-thought/functions/formatConfirmation.ts`

**Step 1: Create lambdas/ingest-thought/functions/invokeProcessThought.ts**

```typescript
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { ProcessThoughtResult } from '../../../types/thought';

const lambda = new LambdaClient({ region: process.env.REGION });

export async function invokeProcessThought(
  text: string,
  source: string,
  sourceRef?: string
): Promise<ProcessThoughtResult> {
  const response = await lambda.send(new InvokeCommand({
    FunctionName: process.env.PROCESS_THOUGHT_FN_NAME,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({ text, source, sourceRef })),
  }));

  const payload = JSON.parse(new TextDecoder().decode(response.Payload));

  if (response.FunctionError) {
    throw new Error(`process-thought error: ${JSON.stringify(payload)}`);
  }

  return payload;
}
```

**Step 2: Create lambdas/ingest-thought/functions/replyInSlack.ts**

```typescript
export async function replyInSlack(channel: string, threadTs: string, text: string): Promise<void> {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, thread_ts: threadTs, text }),
  });
}
```

**Step 3: Create lambdas/ingest-thought/functions/formatConfirmation.ts**

```typescript
import { ProcessThoughtResult } from '../../../types/thought';

export function formatConfirmation(result: ProcessThoughtResult): string {
  let confirmation = `Captured as *${result.type}*`;

  if (result.topics.length > 0) {
    confirmation += ` — ${result.topics.join(', ')}`;
  }
  if (result.people.length > 0) {
    confirmation += `\nPeople: ${result.people.join(', ')}`;
  }
  if (result.action_items.length > 0) {
    confirmation += `\nAction items: ${result.action_items.join('; ')}`;
  }

  return confirmation;
}
```

**Step 4: Create lambdas/ingest-thought/index.ts**

```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { invokeProcessThought } from './functions/invokeProcessThought';
import { replyInSlack } from './functions/replyInSlack';
import { formatConfirmation } from './functions/formatConfirmation';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');

    // Slack URL verification challenge
    if (body.type === 'url_verification') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge: body.challenge }),
      };
    }

    const slackEvent = body.event;

    // Filter: only message events, no bots, no subtypes, correct channel only
    if (
      !slackEvent ||
      slackEvent.type !== 'message' ||
      slackEvent.subtype ||
      slackEvent.bot_id ||
      slackEvent.channel !== process.env.SLACK_CAPTURE_CHANNEL
    ) {
      return { statusCode: 200, headers: {}, body: 'ok' };
    }

    const messageText: string = slackEvent.text;
    const channel: string = slackEvent.channel;
    const messageTs: string = slackEvent.ts;

    if (!messageText || messageText.trim() === '') {
      return { statusCode: 200, headers: {}, body: 'ok' };
    }

    const result = await invokeProcessThought(
      messageText,
      'slack',
      `slack_ts:${messageTs}`
    );

    const confirmation = formatConfirmation(result);
    await replyInSlack(channel, messageTs, confirmation);

    return { statusCode: 200, headers: {}, body: 'ok' };
  } catch (err) {
    console.error('ingest-thought error:', err);
    return { statusCode: 500, headers: {}, body: 'error' };
  }
};
```

**Step 5: Commit**

```bash
git add lambdas/ingest-thought/
git commit -m "feat: add ingest-thought Slack webhook Lambda"
```

---

## Task 5: Build the mcp-server Lambda

**Files:**
- Create: `lambdas/mcp-server/index.ts`
- Create: `lambdas/mcp-server/functions/searchThoughts.ts`
- Create: `lambdas/mcp-server/functions/browseRecent.ts`
- Create: `lambdas/mcp-server/functions/getStats.ts`
- Create: `lambdas/mcp-server/functions/captureThought.ts`
- Create: `lambdas/mcp-server/server.ts`

**Step 1: Create lambdas/mcp-server/functions/searchThoughts.ts**

```typescript
import { S3VectorsClient, QueryVectorsCommand } from '@aws-sdk/client-s3vectors';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { EMBEDDING_MODEL_ID, VECTOR_DIMENSIONS } from '../../../types/config';
import { ThoughtSearchResult } from '../../../types/thought';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });
const bedrock = new BedrockRuntimeClient({ region: process.env.REGION });

export async function searchThoughts(
  query: string,
  limit: number = 10,
  threshold: number = 0.5
): Promise<ThoughtSearchResult[]> {
  // Generate embedding for the query
  const embedResponse = await bedrock.send(new InvokeModelCommand({
    modelId: EMBEDDING_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      inputText: query,
      dimensions: VECTOR_DIMENSIONS,
      normalize: true,
    }),
  }));

  const embedResult = JSON.parse(new TextDecoder().decode(embedResponse.body));
  const queryVector = embedResult.embedding;

  // Search S3 Vectors
  const searchResponse = await s3vectors.send(new QueryVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    queryVector: { float32: queryVector },
    topK: limit,
    returnDistance: true,
    returnMetadata: true,
  }));

  if (!searchResponse.vectors) return [];

  return searchResponse.vectors
    .filter((v: any) => v.distance !== undefined && v.distance <= threshold)
    .map((v: any) => ({
      key: v.key,
      distance: v.distance,
      metadata: v.metadata,
    }));
}
```

**Step 2: Create lambdas/mcp-server/functions/browseRecent.ts**

```typescript
import { S3VectorsClient, ListVectorsCommand, GetVectorsCommand } from '@aws-sdk/client-s3vectors';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });

export async function browseRecent(
  limit: number = 20,
  type?: string,
  topic?: string
): Promise<any[]> {
  // List vectors from the index
  const listResponse = await s3vectors.send(new ListVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
  }));

  if (!listResponse.vectors || listResponse.vectors.length === 0) return [];

  // Get full metadata for listed vectors
  const keys = listResponse.vectors.map((v: any) => v.key).slice(0, 100);

  const getResponse = await s3vectors.send(new GetVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    keys,
    returnMetadata: true,
  }));

  if (!getResponse.vectors) return [];

  let results = getResponse.vectors.map((v: any) => ({
    key: v.key,
    metadata: v.metadata,
  }));

  // Filter by type if provided
  if (type) {
    results = results.filter((r: any) => r.metadata?.type === type);
  }

  // Filter by topic if provided
  if (topic) {
    results = results.filter((r: any) =>
      Array.isArray(r.metadata?.topics) && r.metadata.topics.includes(topic)
    );
  }

  // Sort by created_at descending and limit
  results.sort((a: any, b: any) =>
    (b.metadata?.created_at || '').localeCompare(a.metadata?.created_at || '')
  );

  return results.slice(0, limit);
}
```

**Step 3: Create lambdas/mcp-server/functions/getStats.ts**

```typescript
import { S3VectorsClient, ListVectorsCommand, GetVectorsCommand } from '@aws-sdk/client-s3vectors';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });

export async function getStats(): Promise<any> {
  const listResponse = await s3vectors.send(new ListVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
  }));

  if (!listResponse.vectors || listResponse.vectors.length === 0) {
    return { total: 0, byType: {}, topTopics: [], dateRange: null };
  }

  const keys = listResponse.vectors.map((v: any) => v.key);

  const getResponse = await s3vectors.send(new GetVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    keys: keys.slice(0, 100),
    returnMetadata: true,
  }));

  const vectors = getResponse.vectors || [];
  const byType: Record<string, number> = {};
  const topicCounts: Record<string, number> = {};
  let earliest = '';
  let latest = '';

  for (const v of vectors) {
    const meta = v.metadata as any;
    if (!meta) continue;

    // Count by type
    const type = meta.type || 'unknown';
    byType[type] = (byType[type] || 0) + 1;

    // Count topics
    if (Array.isArray(meta.topics)) {
      for (const t of meta.topics) {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      }
    }

    // Track date range
    const date = meta.created_at || '';
    if (date && (!earliest || date < earliest)) earliest = date;
    if (date && (!latest || date > latest)) latest = date;
  }

  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  return {
    total: keys.length,
    byType,
    topTopics,
    dateRange: earliest ? { earliest, latest } : null,
  };
}
```

**Step 4: Create lambdas/mcp-server/functions/captureThought.ts**

```typescript
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { ProcessThoughtResult } from '../../../types/thought';

const lambda = new LambdaClient({ region: process.env.REGION });

export async function captureThought(
  text: string,
  source: string = 'mcp'
): Promise<ProcessThoughtResult> {
  const response = await lambda.send(new InvokeCommand({
    FunctionName: process.env.PROCESS_THOUGHT_FN_NAME,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({ text, source })),
  }));

  const payload = JSON.parse(new TextDecoder().decode(response.Payload));

  if (response.FunctionError) {
    throw new Error(`process-thought error: ${JSON.stringify(payload)}`);
  }

  return payload;
}
```

**Step 5: Create lambdas/mcp-server/server.ts**

```typescript
import express from 'express';
import { McpServer } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { z } from 'zod';
import { searchThoughts } from './functions/searchThoughts';
import { browseRecent } from './functions/browseRecent';
import { getStats } from './functions/getStats';
import { captureThought } from './functions/captureThought';

const app = express();
app.use(express.json());

function createServer(): McpServer {
  const server = new McpServer({
    name: 'aws-private-mcp',
    version: '1.0.0',
  });

  server.registerTool(
    'search_thoughts',
    {
      title: 'Search Thoughts',
      description: 'Search your brain by meaning. Returns thoughts semantically similar to your query.',
      inputSchema: z.object({
        query: z.string().describe('What to search for — natural language'),
        limit: z.number().optional().default(10).describe('Max results to return'),
        threshold: z.number().optional().default(0.5).describe('Similarity threshold (0=exact, 2=opposite). Lower = stricter.'),
      }),
    },
    async ({ query, limit, threshold }) => {
      const results = await searchThoughts(query, limit, threshold);
      return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.registerTool(
    'browse_recent',
    {
      title: 'Browse Recent Thoughts',
      description: 'List recent thoughts, optionally filtered by type or topic.',
      inputSchema: z.object({
        limit: z.number().optional().default(20).describe('Max results'),
        type: z.string().optional().describe('Filter by type: observation, task, idea, reference, person_note'),
        topic: z.string().optional().describe('Filter by topic tag'),
      }),
    },
    async ({ limit, type, topic }) => {
      const results = await browseRecent(limit, type, topic);
      return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.registerTool(
    'stats',
    {
      title: 'Brain Stats',
      description: 'Get an overview of your brain: total thoughts, breakdown by type, top topics, date range.',
      inputSchema: z.object({}),
    },
    async () => {
      const stats = await getStats();
      return {
        content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
      };
    }
  );

  server.registerTool(
    'capture_thought',
    {
      title: 'Capture Thought',
      description: 'Save a thought to your brain. It gets embedded, classified, and stored automatically.',
      inputSchema: z.object({
        text: z.string().describe('The thought to capture'),
        source: z.string().optional().default('mcp').describe('Where this thought came from'),
      }),
    },
    async ({ text, source }) => {
      const result = await captureThought(text, source);
      let confirmation = `Captured as *${result.type}*`;
      if (result.topics.length > 0) confirmation += ` — ${result.topics.join(', ')}`;
      if (result.people.length > 0) confirmation += `\nPeople: ${result.people.join(', ')}`;
      if (result.action_items.length > 0) confirmation += `\nAction items: ${result.action_items.join('; ')}`;
      return {
        content: [{ type: 'text', text: confirmation }],
      };
    }
  );

  return server;
}

app.post('/mcp', async (req, res) => {
  const server = createServer();
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', (_req, res) => {
  res.status(405).json({ error: 'Method not allowed. Use POST.' });
});

app.delete('/mcp', (_req, res) => {
  res.status(405).json({ error: 'Session termination not supported in stateless mode.' });
});

export { app };
```

**Step 6: Create lambdas/mcp-server/index.ts**

```typescript
import serverlessExpress from '@codegenie/serverless-express';
import { app } from './server';

export const handler = serverlessExpress({ app });
```

**Step 7: Commit**

```bash
git add lambdas/mcp-server/
git commit -m "feat: add mcp-server Lambda with search, browse, stats, capture tools"
```

---

## Task 6: Create the AWS Account and Bootstrap CDK

This task requires manual steps — creating the account in FeO org, configuring the AWS CLI profile, and bootstrapping CDK.

**Step 1: Create the account in AWS Organizations**

- Log into the FeO management account (145676147420)
- Create a new account named `aws-private-mcp`
- Note the account ID once created
- Add it to the appropriate OU

**Step 2: Configure AWS CLI profile**

```bash
# Add to ~/.aws/config
[profile private-mcp]
sso_session = feo
sso_account_id = <NEW_ACCOUNT_ID>
sso_role_name = AdministratorAccess
region = us-west-2
output = json
```

**Step 3: Update infra/lib/config/index.ts with the account ID**

Replace the empty `accountId` with the new account ID.

**Step 4: Bootstrap CDK**

```bash
cd ~/projects/AWSPrivateMCP/aws-private-mcp-infra
npx cdk bootstrap aws://<NEW_ACCOUNT_ID>/us-west-2 --profile private-mcp
```

**Step 5: Enable Bedrock model access**

In the AWS Console for the new account:
- Go to Bedrock → Model access
- Request access to Amazon Titan Text Embeddings V2 and Anthropic Claude 3 Haiku

**Step 6: Create the S3 Vector bucket and index**

```bash
aws s3vectors create-vector-bucket \
  --vector-bucket-name aws-private-mcp-thoughts \
  --profile private-mcp

aws s3vectors create-index \
  --vector-bucket-name aws-private-mcp-thoughts \
  --index-name thoughts \
  --data-type float32 \
  --dimension 1024 \
  --distance-metric cosine \
  --profile private-mcp
```

**Step 7: Commit config update**

```bash
git add infra/lib/config/index.ts
git commit -m "feat: add account ID and config for aws-private-mcp account"
```

---

## Task 7: Deploy and Test

**Step 1: Synth and verify**

```bash
cd ~/projects/AWSPrivateMCP/aws-private-mcp-infra
pnpm synth
```

**Step 2: Deploy**

```bash
npx cdk deploy AWSPrivateMCPStack \
  --profile private-mcp \
  -c slackBotToken=xoxb-your-token \
  -c slackCaptureChannel=C0your-channel-id
```

**Step 3: Note outputs**

Save the API Gateway URL, Slack webhook URL, MCP endpoint URL, and API Key ID from the deploy outputs.

**Step 4: Retrieve the API key value**

```bash
aws apigateway get-api-key --api-key <API_KEY_ID> --include-value --profile private-mcp
```

**Step 5: Configure Slack Event Subscriptions**

- Go to api.slack.com/apps → your app → Event Subscriptions
- Enable Events, paste the Slack Webhook URL
- Subscribe to `message.channels` and `message.groups`
- Save Changes

**Step 6: Test Slack capture**

Type in your Slack capture channel:
```
Sarah mentioned she's thinking about leaving her job to start a consulting business
```

Verify: threaded reply in Slack + row in S3 Vectors.

**Step 7: Connect Claude Code**

```bash
claude mcp add --transport http open-brain \
  https://<API_GATEWAY_URL>/mcp \
  --header "x-api-key: <YOUR_API_KEY_VALUE>"
```

**Step 8: Test MCP tools**

Ask Claude: "Search my thoughts for career changes"
Ask Claude: "How many thoughts do I have?"
Ask Claude: "Save this: decided to move the launch to March 15"

**Step 9: Commit any fixes**

```bash
git add -A
git commit -m "fix: deployment adjustments from testing"
```

---

## Task 8: Create GitHub Repo and Push

**Step 1: Create the repo**

```bash
gh repo create rusty428/aws-private-mcp-infra --private
```

**Step 2: Add remote and push**

```bash
cd ~/projects/AWSPrivateMCP/aws-private-mcp-infra
git remote add origin git@github.com:rusty428/aws-private-mcp-infra.git
git push -u origin main
```
