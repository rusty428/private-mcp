import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

export async function getThought(id: string): Promise<{ key: string; metadata: Record<string, any> } | null> {
  const result = await ddb.send(new GetCommand({
    TableName: process.env.TABLE_NAME,
    Key: { pk: `THOUGHT#${id}`, sk: 'METADATA' },
  }));

  if (!result.Item) return null;

  const { pk, sk, month, enriched, ...metadata } = result.Item;
  return { key: id, metadata };
}
