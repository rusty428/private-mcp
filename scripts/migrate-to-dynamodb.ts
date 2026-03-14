import { S3VectorsClient, ListVectorsCommand, GetVectorsCommand } from '@aws-sdk/client-s3vectors';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { VECTOR_BUCKET_NAME, VECTOR_INDEX_NAME, THOUGHTS_TABLE_NAME } from '../types/config';

const REGION = 'us-west-2';
const s3vectors = new S3VectorsClient({ region: REGION });
const ddbClient = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

async function migrate() {
  console.log('Starting migration from S3 Vectors to DynamoDB...');
  console.log(`Table: ${THOUGHTS_TABLE_NAME}`);

  // Stage 1: List all vector keys
  const allKeys: string[] = [];
  let nextToken: string | undefined;
  do {
    const listResponse: any = await s3vectors.send(new ListVectorsCommand({
      vectorBucketName: VECTOR_BUCKET_NAME,
      indexName: VECTOR_INDEX_NAME,
      ...(nextToken ? { nextToken } : {}),
    }));
    if (listResponse.vectors) {
      allKeys.push(...listResponse.vectors.map((v: any) => v.key));
    }
    nextToken = listResponse.nextToken;
  } while (nextToken);

  console.log(`Found ${allKeys.length} vectors in S3 Vectors`);

  // Stage 2: Batch fetch metadata and write to DDB
  let migrated = 0;
  let skipped = 0;
  const projects = new Set<string>();

  for (let i = 0; i < allKeys.length; i += 100) {
    const batch = allKeys.slice(i, i + 100);
    const getResponse = await s3vectors.send(new GetVectorsCommand({
      vectorBucketName: VECTOR_BUCKET_NAME,
      indexName: VECTOR_INDEX_NAME,
      keys: batch,
      returnMetadata: true,
    }));

    if (!getResponse.vectors) continue;

    const items = getResponse.vectors.map((v: any) => {
      const metadata = v.metadata || {};
      const thoughtDate = metadata.thought_date || metadata.created_at?.slice(0, 10) || '';
      const month = thoughtDate.slice(0, 7) || metadata.created_at?.slice(0, 7) || '';
      const enriched = metadata.type !== 'pending';
      if (metadata.project) projects.add(metadata.project);

      const item: Record<string, any> = {
        pk: `THOUGHT#${v.key}`,
        sk: 'METADATA',
        month,
        enriched,
        ...metadata,
      };

      for (const key of Object.keys(item)) {
        if (Array.isArray(item[key]) && item[key].length === 0) {
          delete item[key];
        }
      }
      return item;
    });

    for (let j = 0; j < items.length; j += 25) {
      const subBatch = items.slice(j, j + 25);
      try {
        const writeResult = await ddb.send(new BatchWriteCommand({
          RequestItems: {
            [THOUGHTS_TABLE_NAME]: subBatch.map((item) => ({
              PutRequest: { Item: item },
            })),
          },
        }));
        const unprocessed = writeResult.UnprocessedItems?.[THOUGHTS_TABLE_NAME]?.length || 0;
        migrated += subBatch.length - unprocessed;
        if (unprocessed > 0) {
          console.warn(`  ${unprocessed} unprocessed items at offset ${i + j} -- skipping`);
          skipped += unprocessed;
        }
      } catch (err: any) {
        console.warn(`  Skipping batch at offset ${i + j}: ${err.message}`);
        skipped += subBatch.length;
      }
    }

    if ((i + 100) % 500 === 0 || i + 100 >= allKeys.length) {
      console.log(`  Progress: ${Math.min(i + 100, allKeys.length)}/${allKeys.length} processed`);
    }
  }

  // Stage 3: Write projects meta-item
  if (projects.size > 0) {
    await ddb.send(new UpdateCommand({
      TableName: THOUGHTS_TABLE_NAME,
      Key: { pk: 'META#PROJECTS', sk: 'METADATA' },
      UpdateExpression: 'ADD projects :p',
      ExpressionAttributeValues: { ':p': projects },
    }));
    console.log(`  Projects meta-item written: ${Array.from(projects).sort().join(', ')}`);
  }

  console.log(`\nMigration complete:`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Total VDB: ${allKeys.length}`);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
