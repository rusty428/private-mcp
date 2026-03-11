import { S3VectorsClient, ListVectorsCommand, GetVectorsCommand } from '@aws-sdk/client-s3vectors';
import { MAX_LIST_LIMIT, VALID_THOUGHT_TYPES } from '../../../types/validation';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });

export async function browseRecent(
  limit: number = 20,
  type?: string,
  topic?: string,
  project?: string,
): Promise<any[]> {
  limit = Math.min(limit, MAX_LIST_LIMIT);
  if (type && !VALID_THOUGHT_TYPES.includes(type as any)) {
    throw new Error(`Invalid type. Must be one of: ${VALID_THOUGHT_TYPES.join(', ')}`);
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

  let results = getResponse.vectors.map((v: any) => ({
    key: v.key,
    metadata: v.metadata,
  }));

  // Exclude noise (treat missing quality as standard for backward compat)
  results = results.filter((r: any) => r.metadata?.quality !== 'noise');

  if (type) {
    results = results.filter((r: any) => r.metadata?.type === type);
  }

  if (topic) {
    results = results.filter((r: any) =>
      Array.isArray(r.metadata?.topics) && r.metadata.topics.includes(topic)
    );
  }

  if (project) {
    results = results.filter((r: any) => r.metadata?.project === project);
  }

  results.sort((a: any, b: any) =>
    (b.metadata?.created_at || '').localeCompare(a.metadata?.created_at || '')
  );

  return results.slice(0, limit);
}
