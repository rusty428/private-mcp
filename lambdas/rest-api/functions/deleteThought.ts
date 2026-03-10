import { S3VectorsClient, DeleteVectorsCommand } from '@aws-sdk/client-s3vectors';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });

export async function deleteThought(id: string) {
  await s3vectors.send(new DeleteVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    keys: [id],
  }));
  return { success: true };
}
