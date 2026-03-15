import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

const DEFAULT_TIMEZONE = 'America/Los_Angeles';

let cachedTimezone: string | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function loadTimezone(): Promise<string> {
  const now = Date.now();
  if (cachedTimezone && now - cacheTime < CACHE_TTL) return cachedTimezone;

  try {
    const result = await ddb.send(new GetCommand({
      TableName: process.env.SETTINGS_TABLE_NAME,
      Key: { pk: 'enrichment', sk: 'config' },
      ProjectionExpression: 'timezone',
    }));

    const tz = result.Item?.timezone || DEFAULT_TIMEZONE;
    cachedTimezone = tz;
    cacheTime = now;
    return tz;
  } catch (err) {
    console.error('Failed to load timezone setting, using default:', err);
    return DEFAULT_TIMEZONE;
  }
}
