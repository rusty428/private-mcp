import { S3VectorsClient, ListVectorsCommand, GetVectorsCommand } from '@aws-sdk/client-s3vectors';
import { ThoughtMetadata } from '../../../types/thought';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });

interface ThoughtWithKey {
  key: string;
  metadata: ThoughtMetadata;
}

export async function getTodaysThoughts(todayDateStr: string): Promise<ThoughtWithKey[]> {
  const listResponse = await s3vectors.send(new ListVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
  }));

  if (!listResponse.vectors || listResponse.vectors.length === 0) return [];

  const keys = listResponse.vectors.map((v: any) => v.key);

  const allThoughts: ThoughtWithKey[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    const getResponse = await s3vectors.send(new GetVectorsCommand({
      vectorBucketName: process.env.VECTOR_BUCKET_NAME,
      indexName: process.env.VECTOR_INDEX_NAME,
      keys: batch,
      returnMetadata: true,
    }));

    if (getResponse.vectors) {
      for (const v of getResponse.vectors) {
        const meta = v.metadata as unknown as ThoughtMetadata;
        const dateStr = meta?.thought_date || meta?.created_at?.slice(0, 10) || '';
        const isNoise = meta?.quality === 'noise';
        if (dateStr === todayDateStr && !isNoise) {
          allThoughts.push({ key: v.key!, metadata: meta });
        }
      }
    }
  }

  return allThoughts;
}
