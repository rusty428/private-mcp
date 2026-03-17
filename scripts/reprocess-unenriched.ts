/**
 * One-time script: re-invoke enrich-thought for all unenriched records.
 * Run: npx tsx scripts/reprocess-unenriched.ts
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const REGION = 'us-west-2';
const TABLE_NAME = 'private-mcp-thoughts';
const ENRICH_FN_NAME = process.env.ENRICH_FN_NAME || '';

if (!ENRICH_FN_NAME) {
  console.error('Set ENRICH_FN_NAME env var to the enrich-thought Lambda function name');
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const lambda = new LambdaClient({ region: REGION });

const BATCH_SIZE = 5;
const DELAY_MS = 1000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('Scanning for unenriched records...');

  let items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;

  do {
    const result = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'enriched = :false AND begins_with(pk, :prefix)',
      ExpressionAttributeValues: { ':false': false, ':prefix': 'THOUGHT#' },
      ExclusiveStartKey: lastKey,
    }));
    if (result.Items) items.push(...result.Items);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  console.log(`Found ${items.length} unenriched records`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (item) => {
      const id = item.pk.replace('THOUGHT#', '');
      const payload = {
        id,
        content: item.content || '',
        source: item.source || 'mcp',
        project: item.project || '',
        session_id: item.session_id || '',
        session_name: item.session_name || '',
        source_ref: item.source_ref || '',
        thought_date: item.thought_date || '',
        created_at: item.created_at || '',
      };

      try {
        await lambda.send(new InvokeCommand({
          FunctionName: ENRICH_FN_NAME,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify(payload)),
        }));
        success++;
        console.log(`  [${success + failed}/${items.length}] Invoked for ${id} (project: ${item.project || 'none'})`);
      } catch (err: any) {
        failed++;
        console.error(`  FAILED ${id}: ${err.message}`);
      }
    });

    await Promise.all(promises);

    if (i + BATCH_SIZE < items.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\nDone. Invoked: ${success}, Failed: ${failed}`);
}

main().catch(console.error);
