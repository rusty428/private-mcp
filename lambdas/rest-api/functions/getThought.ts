import { S3VectorsClient, GetVectorsCommand } from '@aws-sdk/client-s3vectors';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });

export async function getThought(id: string) {
  const response = await s3vectors.send(new GetVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    keys: [id],
    returnMetadata: true,
  }));
  if (!response.vectors || response.vectors.length === 0) return null;
  const v = response.vectors[0];
  return { key: v.key, metadata: v.metadata };
}
