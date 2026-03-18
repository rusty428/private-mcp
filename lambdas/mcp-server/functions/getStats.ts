import { S3VectorsClient, ListVectorsCommand, GetVectorsCommand } from '@aws-sdk/client-s3vectors';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });

export async function getStats(): Promise<any> {
  const listResponse = await s3vectors.send(new ListVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
  }));

  if (!listResponse.vectors || listResponse.vectors.length === 0) {
    return { total: 0, byType: {}, topTopics: [], dateRange: null };
  }

  const keys = listResponse.vectors.map((v: any) => v.key);

  const getResponse = await s3vectors.send(new GetVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    keys: keys.slice(0, 100),
    returnMetadata: true,
  }));

  const vectors = getResponse.vectors || [];
  const byType: Record<string, number> = {};
  const topicCounts: Record<string, number> = {};
  let earliest = '';
  let latest = '';

  for (const v of vectors) {
    const meta = v.metadata as any;
    if (!meta) continue;

    const type = meta.type || 'unknown';
    byType[type] = (byType[type] || 0) + 1;

    if (Array.isArray(meta.topics)) {
      for (const t of meta.topics) {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      }
    }

    const date = meta.created_at || '';
    if (date && (!earliest || date < earliest)) earliest = date;
    if (date && (!latest || date > latest)) latest = date;
  }

  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  return {
    total: keys.length,
    byType,
    topTopics,
    dateRange: earliest ? { earliest, latest } : null,
  };
}
