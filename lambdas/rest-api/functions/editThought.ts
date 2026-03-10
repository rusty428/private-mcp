import { S3VectorsClient, GetVectorsCommand, PutVectorsCommand } from '@aws-sdk/client-s3vectors';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });

interface EditThoughtInput {
  type?: string;
  topics?: string[];
  project?: string;
  summary?: string;
  people?: string[];
  action_items?: string[];
}

export async function editThought(id: string, updates: EditThoughtInput) {
  const getResponse = await s3vectors.send(new GetVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    keys: [id],
    returnMetadata: true,
    returnData: true,
  }));

  if (!getResponse.vectors || getResponse.vectors.length === 0) {
    return { error: 'not_found' as const };
  }

  const existing = getResponse.vectors[0];
  const metadata = existing.metadata as any;

  if (metadata?.type === 'pending') {
    return { error: 'pending' as const };
  }

  if (!existing.data) {
    throw new Error('GetVectors did not return embedding data — cannot safely update');
  }

  const updatedMetadata = { ...metadata };
  if (updates.type !== undefined) updatedMetadata.type = updates.type;
  if (updates.topics !== undefined) updatedMetadata.topics = updates.topics;
  if (updates.project !== undefined) updatedMetadata.project = updates.project;
  if (updates.summary !== undefined) updatedMetadata.summary = updates.summary;
  if (updates.people !== undefined) updatedMetadata.people = updates.people;
  if (updates.action_items !== undefined) updatedMetadata.action_items = updates.action_items;

  for (const key of Object.keys(updatedMetadata)) {
    if (Array.isArray(updatedMetadata[key]) && updatedMetadata[key].length === 0) {
      delete updatedMetadata[key];
    }
  }

  await s3vectors.send(new PutVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    vectors: [{ key: id, data: existing.data, metadata: updatedMetadata }],
  }));

  return { success: true, metadata: updatedMetadata };
}
