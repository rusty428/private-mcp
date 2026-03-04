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
          source: metadata.source,
          source_ref: metadata.source_ref || '',
          created_at: metadata.created_at,
          // S3 Vectors does not allow empty arrays in metadata — only include non-empty arrays
          ...(metadata.topics.length > 0 && { topics: metadata.topics }),
          ...(metadata.people.length > 0 && { people: metadata.people }),
          ...(metadata.action_items.length > 0 && { action_items: metadata.action_items }),
          ...(metadata.dates_mentioned.length > 0 && { dates_mentioned: metadata.dates_mentioned }),
        },
      },
    ],
  }));
}
