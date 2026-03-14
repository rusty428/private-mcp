import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { EnrichmentSettings, DEFAULT_ENRICHMENT_SETTINGS } from '../../../types/settings';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

let cached: EnrichmentSettings | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function loadSettings(): Promise<EnrichmentSettings> {
  const now = Date.now();
  if (cached && now - cacheTime < CACHE_TTL) return cached;

  try {
    const result = await ddb.send(new GetCommand({
      TableName: process.env.SETTINGS_TABLE_NAME,
      Key: { pk: 'enrichment', sk: 'config' },
    }));

    if (result.Item) {
      cached = {
        types: result.Item.types || DEFAULT_ENRICHMENT_SETTINGS.types,
        defaultType: result.Item.defaultType || DEFAULT_ENRICHMENT_SETTINGS.defaultType,
        projects: result.Item.projects || {},
        classificationModel: result.Item.classificationModel || DEFAULT_ENRICHMENT_SETTINGS.classificationModel,
        specialInstructions: result.Item.specialInstructions ?? null,
        customPrompt: result.Item.customPrompt ?? null,
        updatedAt: result.Item.updatedAt || '',
      };
    } else {
      cached = { ...DEFAULT_ENRICHMENT_SETTINGS };
    }
    cacheTime = now;
    return cached;
  } catch (err) {
    console.error('Failed to load settings, using defaults:', err);
    return { ...DEFAULT_ENRICHMENT_SETTINGS };
  }
}
