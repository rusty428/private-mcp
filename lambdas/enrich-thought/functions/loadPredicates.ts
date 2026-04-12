import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DEFAULT_PREDICATES } from '../../../types/graph';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

let cached: string[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function loadPredicates(teamId: string): Promise<string[]> {
  const now = Date.now();
  if (cached && now - cacheTime < CACHE_TTL) return cached;

  try {
    const result = await ddb.send(new GetCommand({
      TableName: process.env.GRAPH_TABLE_NAME,
      Key: { pk: `CONFIG#${teamId}`, sk: 'PREDICATES' },
    }));

    if (result.Item?.predicates) {
      cached = result.Item.predicates as string[];
    } else {
      cached = [...DEFAULT_PREDICATES];
    }
    cacheTime = now;
    return cached;
  } catch (err) {
    console.error('Failed to load predicates, using defaults:', err);
    return [...DEFAULT_PREDICATES];
  }
}
