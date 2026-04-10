import { DynamoDBClient, ScanCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3VectorsClient, GetVectorsCommand, PutVectorsCommand } from '@aws-sdk/client-s3vectors';
import { THOUGHTS_TABLE_NAME, THOUGHTS_TABLE_V1_NAME, VECTOR_BUCKET_NAME, VECTOR_INDEX_NAME } from '../types/config';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

const region = process.env.AWS_REGION || 'us-west-2';
const ddbClient = new DynamoDBClient({ region });
const ddb = DynamoDBDocumentClient.from(ddbClient);
const s3vectors = new S3VectorsClient({ region });

const DEFAULT_USER_ID = 'owner';
const DEFAULT_TEAM_ID = 'default';

async function tableExists(tableName: string): Promise<boolean> {
  try {
    await ddbClient.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (err: any) {
    if (err.name === 'ResourceNotFoundException') return false;
    throw err;
  }
}

async function migrate() {
  // Check if v1 table exists — if not, this is a fresh deployment, nothing to migrate
  const v1Exists = await tableExists(THOUGHTS_TABLE_V1_NAME);
  if (!v1Exists) {
    console.log(`v1 table (${THOUGHTS_TABLE_V1_NAME}) not found — fresh deployment, nothing to migrate.`);
    return;
  }

  const v2Exists = await tableExists(THOUGHTS_TABLE_NAME);
  if (!v2Exists) {
    console.error(`v2 table (${THOUGHTS_TABLE_NAME}) not found — run cdk deploy first.`);
    process.exit(1);
  }

  console.log(`Migrating ${THOUGHTS_TABLE_V1_NAME} → ${THOUGHTS_TABLE_NAME}`);
  console.log(`Default user_id: ${DEFAULT_USER_ID}, team_id: ${DEFAULT_TEAM_ID}`);
  console.log(`S3 Vectors: stamping user_id/team_id on metadata (vectors unchanged)`);

  let totalScanned = 0;
  let totalCopied = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const scanResult = await ddbClient.send(new ScanCommand({
      TableName: THOUGHTS_TABLE_V1_NAME,
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    totalScanned += scanResult.ScannedCount || 0;

    if (scanResult.Items) {
      for (const rawItem of scanResult.Items) {
        const pk = rawItem.pk?.S;
        const sk = rawItem.sk?.S;
        if (!pk || !sk) {
          totalSkipped++;
          continue;
        }

        // Convert DynamoDB AttributeValue format to DocumentClient format
        const item: Record<string, any> = {};
        for (const [key, value] of Object.entries(rawItem)) {
          if (value.S !== undefined) item[key] = value.S;
          else if (value.N !== undefined) item[key] = Number(value.N);
          else if (value.BOOL !== undefined) item[key] = value.BOOL;
          else if (value.L !== undefined) item[key] = value.L.map((v: any) => v.S || v.N || v);
          else if (value.SS !== undefined) item[key] = new Set(value.SS);
          else if (value.M !== undefined) item[key] = value.M;
          else if (value.NULL !== undefined) item[key] = null;
        }

        // Stamp identity fields (default to owner/default if missing)
        if (!item.user_id) item.user_id = DEFAULT_USER_ID;
        if (!item.team_id) item.team_id = DEFAULT_TEAM_ID;

        // Write to v2 table (idempotent — overwrites if already exists)
        try {
          await ddb.send(new PutCommand({
            TableName: THOUGHTS_TABLE_NAME,
            Item: item,
          }));
        } catch (err: any) {
          console.error(`DDB copy failed for ${pk}:`, err.message);
          totalErrors++;
          continue;
        }

        // Update S3 Vectors metadata with identity fields
        if (pk.startsWith('THOUGHT#')) {
          const thoughtId = pk.replace('THOUGHT#', '');
          try {
            const getResult = await s3vectors.send(new GetVectorsCommand({
              vectorBucketName: VECTOR_BUCKET_NAME,
              indexName: VECTOR_INDEX_NAME,
              keys: [thoughtId],
              returnMetadata: true,
              returnData: true,
            }));

            if (getResult.vectors && getResult.vectors.length > 0) {
              const vector = getResult.vectors[0];
              const metadata = vector.metadata as Record<string, any> | undefined;
              if (metadata && !metadata.user_id) {
                await s3vectors.send(new PutVectorsCommand({
                  vectorBucketName: VECTOR_BUCKET_NAME,
                  indexName: VECTOR_INDEX_NAME,
                  vectors: [{
                    key: thoughtId,
                    data: vector.data!,
                    metadata: {
                      ...metadata,
                      user_id: DEFAULT_USER_ID,
                      team_id: DEFAULT_TEAM_ID,
                    },
                  }],
                }));
              }
            }
          } catch (err: any) {
            console.error(`S3 Vectors update failed for ${thoughtId}:`, err.message);
            totalErrors++;
          }
        }

        totalCopied++;
        if (totalCopied % 50 === 0) {
          console.log(`  Progress: ${totalCopied} copied, ${totalScanned} scanned...`);
        }
      }
    }

    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log('\nMigration complete.');
  console.log(`  Scanned: ${totalScanned}`);
  console.log(`  Copied:  ${totalCopied}`);
  console.log(`  Skipped: ${totalSkipped}`);
  console.log(`  Errors:  ${totalErrors}`);
  if (totalCopied > 0) {
    console.log(`\nv1 table (${THOUGHTS_TABLE_V1_NAME}) is still intact — safe to delete after verification.`);
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
