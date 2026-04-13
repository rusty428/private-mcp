import { S3VectorsClient, PutVectorsCommand } from '@aws-sdk/client-s3vectors';
import { ThoughtMetadata } from '../../../types/thought';
import { VECTOR_BUCKET_NAME, VECTOR_INDEX_NAME } from '../../../types/config';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });

// NOTE: S3 Vectors PutVectors rejects empty arrays in metadata values.
// Removing this filter will cause writes to fail. All array fields must be
// stripped when empty before the PutVectors call.
function filterEmptyArrays(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value;
  }
  return result;
}

export async function storeThought(
  id: string,
  vector: number[],
  metadata: ThoughtMetadata
): Promise<void> {
  // Truncate content for S3 Vectors metadata (2048 byte limit).
  // Full content lives in DynamoDB; S3 Vectors only needs a prefix for filtering.
  const truncatedContent = metadata.content.length > 500
    ? metadata.content.slice(0, 500) + '...'
    : metadata.content;

  const cleanMetadata = filterEmptyArrays({
    content: truncatedContent,
    summary: metadata.summary,
    type: metadata.type,
    topics: metadata.topics,
    people: metadata.people,
    people_lower: metadata.people_lower,
    action_items: metadata.action_items,
    dates_mentioned: metadata.dates_mentioned,
    project: metadata.project,
    related_projects: metadata.related_projects,
    source: metadata.source,
    source_ref: metadata.source_ref,
    session_id: metadata.session_id,
    session_name: metadata.session_name,
    user_id: metadata.user_id,
    team_id: metadata.team_id,
    quality: metadata.quality,
    thought_date: metadata.thought_date,
    created_at: metadata.created_at,
  });

  await s3vectors.send(new PutVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME || VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME || VECTOR_INDEX_NAME,
    vectors: [{
      key: id,
      data: { float32: vector },
      metadata: cleanMetadata,
    }],
  }));
}
