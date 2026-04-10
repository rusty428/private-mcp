import { S3VectorsClient, ListVectorsCommand, GetVectorsCommand } from '@aws-sdk/client-s3vectors';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { MAX_LIST_LIMIT, VALID_THOUGHT_TYPES } from '../../../types/validation';
import { loadSettings } from './loadSettings';
import { resolveProjectAlias } from './resolveProjectAlias';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });
const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

let cachedTypes: string[] | null = null;
let typesCacheTime = 0;
const TYPES_CACHE_TTL = 5 * 60 * 1000;

async function getValidTypes(): Promise<string[]> {
  const now = Date.now();
  if (cachedTypes && now - typesCacheTime < TYPES_CACHE_TTL) return cachedTypes;
  try {
    const result = await ddb.send(new GetCommand({
      TableName: process.env.SETTINGS_TABLE_NAME,
      Key: { pk: 'enrichment', sk: 'config' },
    }));
    const types: string[] = result.Item?.types ?? [...VALID_THOUGHT_TYPES];
    cachedTypes = types;
    typesCacheTime = now;
    return types;
  } catch {
    return [...VALID_THOUGHT_TYPES];
  }
}

export async function browseRecent(
  limit: number = 20,
  type?: string,
  topic?: string,
  project?: string,
  team_id?: string,
): Promise<any[]> {
  limit = Math.min(limit, MAX_LIST_LIMIT);
  if (type) {
    const validTypes = await getValidTypes();
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
    }
  }

  const listResponse = await s3vectors.send(new ListVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
  }));

  if (!listResponse.vectors || listResponse.vectors.length === 0) return [];

  const keys = listResponse.vectors.map((v: any) => v.key).slice(0, 100);

  const getResponse = await s3vectors.send(new GetVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    keys,
    returnMetadata: true,
  }));

  if (!getResponse.vectors) return [];

  const settings = await loadSettings();

  let results = getResponse.vectors.map((v: any) => ({
    key: v.key,
    metadata: {
      ...v.metadata,
      project: v.metadata?.project ? resolveProjectAlias(v.metadata.project, settings) : v.metadata?.project,
    },
  }));

  // Exclude noise (treat missing quality as standard for backward compat)
  results = results.filter((r: any) => r.metadata?.quality !== 'noise');

  if (team_id) {
    results = results.filter((r: any) => r.metadata?.team_id === team_id);
  }

  if (type) {
    results = results.filter((r: any) => r.metadata?.type === type);
  }

  if (topic) {
    results = results.filter((r: any) =>
      Array.isArray(r.metadata?.topics) && r.metadata.topics.includes(topic)
    );
  }

  if (project) {
    const normalizedProject = resolveProjectAlias(project, settings);
    results = results.filter((r: any) => r.metadata?.project === normalizedProject);
  }

  results.sort((a: any, b: any) =>
    (b.metadata?.created_at || '').localeCompare(a.metadata?.created_at || '')
  );

  return results.slice(0, limit);
}
