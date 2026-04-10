import { DynamoDBClient, ScanCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3VectorsClient, GetVectorsCommand, PutVectorsCommand } from '@aws-sdk/client-s3vectors';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const region = process.env.REGION || 'us-west-2';
const ddbClient = new DynamoDBClient({ region });
const ddb = DynamoDBDocumentClient.from(ddbClient);
const s3vectors = new S3VectorsClient({ region });

const V1_TABLE = process.env.V1_TABLE_NAME!;
const V2_TABLE = process.env.V2_TABLE_NAME!;
const VECTOR_BUCKET = process.env.VECTOR_BUCKET_NAME!;
const VECTOR_INDEX = process.env.VECTOR_INDEX_NAME!;
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

async function migrate(): Promise<{ scanned: number; copied: number; skipped: number; errors: number }> {
  const v1Exists = await tableExists(V1_TABLE);
  if (!v1Exists) {
    console.log(`v1 table (${V1_TABLE}) not found — fresh deployment, nothing to migrate.`);
    return { scanned: 0, copied: 0, skipped: 0, errors: 0 };
  }

  console.log(`Migrating ${V1_TABLE} → ${V2_TABLE}`);
  let totalScanned = 0;
  let totalCopied = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const scanResult = await ddbClient.send(new ScanCommand({
      TableName: V1_TABLE,
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

        const item = unmarshall(rawItem);
        if (!item.user_id) item.user_id = DEFAULT_USER_ID;
        if (!item.team_id) item.team_id = DEFAULT_TEAM_ID;

        try {
          await ddb.send(new PutCommand({ TableName: V2_TABLE, Item: item }));
        } catch (err: any) {
          console.error(`DDB copy failed for ${pk}:`, err.message);
          totalErrors++;
          continue;
        }

        // Stamp identity fields on S3 Vectors metadata
        if (pk.startsWith('THOUGHT#')) {
          const thoughtId = pk.replace('THOUGHT#', '');
          try {
            const getResult = await s3vectors.send(new GetVectorsCommand({
              vectorBucketName: VECTOR_BUCKET,
              indexName: VECTOR_INDEX,
              keys: [thoughtId],
              returnMetadata: true,
              returnData: true,
            }));

            if (getResult.vectors && getResult.vectors.length > 0) {
              const vector = getResult.vectors[0];
              const metadata = vector.metadata as Record<string, any> | undefined;
              if (metadata && !metadata.user_id) {
                await s3vectors.send(new PutVectorsCommand({
                  vectorBucketName: VECTOR_BUCKET,
                  indexName: VECTOR_INDEX,
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
        if (totalCopied % 100 === 0) {
          console.log(`  Progress: ${totalCopied} copied, ${totalScanned} scanned...`);
        }
      }
    }

    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`Migration complete. Scanned: ${totalScanned}, Copied: ${totalCopied}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`);
  return { scanned: totalScanned, copied: totalCopied, skipped: totalSkipped, errors: totalErrors };
}

export const handler = async (event: any): Promise<any> => {
  const requestType = event.RequestType;

  if (requestType !== 'Create') {
    return { PhysicalResourceId: 'migrate-identity', Data: {} };
  }

  const result = await migrate();

  return {
    PhysicalResourceId: 'migrate-identity',
    Data: {
      Scanned: String(result.scanned),
      Copied: String(result.copied),
      Errors: String(result.errors),
      Message: result.scanned === 0 ? 'Fresh deployment — no migration needed' : `Migrated ${result.copied} items`,
    },
  };
};
