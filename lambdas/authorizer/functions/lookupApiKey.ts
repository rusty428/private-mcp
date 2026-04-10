import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ApiKey } from '../../../types/identity';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

export async function lookupApiKey(keyHash: string): Promise<ApiKey | null> {
  const result = await ddb.send(new QueryCommand({
    TableName: process.env.API_KEYS_TABLE_NAME,
    IndexName: 'keyHash-index',
    KeyConditionExpression: 'keyHash = :keyHash',
    ExpressionAttributeValues: { ':keyHash': keyHash },
    Limit: 1,
  }));

  if (!result.Items || result.Items.length === 0) return null;

  const item = result.Items[0] as ApiKey;
  if (item.status !== 'active') return null;
  if (item.expiresAt && item.expiresAt < new Date().toISOString()) return null;

  // Fire-and-forget lastUsedAt update
  ddb.send(new UpdateCommand({
    TableName: process.env.API_KEYS_TABLE_NAME,
    Key: { keyId: item.keyId },
    UpdateExpression: 'SET lastUsedAt = :now',
    ExpressionAttributeValues: { ':now': new Date().toISOString() },
  })).catch(() => {});

  return item;
}
