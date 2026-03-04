import { S3VectorsClient, PutVectorsCommand } from '@aws-sdk/client-s3vectors';
import { ThoughtMetadata } from '../../../types/thought';
import { VECTOR_BUCKET_NAME, VECTOR_INDEX_NAME } from '../../../types/config';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });

export async function storeThought(
  id: string,
  embedding: number[],
  metadata: ThoughtMetadata
): Promise<void> {
  await s3vectors.send(new PutVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME || VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME || VECTOR_INDEX_NAME,
    vectors: [
      {
        key: id,
        data: { float32: embedding },
        metadata: {
          content: metadata.content,
          type: metadata.type,
          topics: metadata.topics,
          people: metadata.people,
          action_items: metadata.action_items,
          dates_mentioned: metadata.dates_mentioned,
          source: metadata.source,
          source_ref: metadata.source_ref || '',
          created_at: metadata.created_at,
        },
      },
    ],
  }));
}
