import { S3VectorsClient, DeleteVectorsCommand } from '@aws-sdk/client-s3vectors';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });
const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

export async function deleteThought(id: string, team_id?: string) {
  if (team_id) {
    const check = await ddb.send(new GetCommand({
      TableName: process.env.TABLE_NAME,
      Key: { pk: `THOUGHT#${id}`, sk: 'METADATA' },
    }));
    if (!check.Item) return { error: 'not_found' as const };
    if (check.Item.team_id && check.Item.team_id !== team_id) {
      return { error: 'not_found' as const };
    }
  }

  // DDB delete first — UI source of truth
  await ddb.send(new DeleteCommand({
    TableName: process.env.TABLE_NAME,
    Key: { pk: `THOUGHT#${id}`, sk: 'METADATA' },
  }));

  await s3vectors.send(new DeleteVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    keys: [id],
  }));

  return { success: true };
}
