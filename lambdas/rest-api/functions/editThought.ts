import { S3VectorsClient, GetVectorsCommand, PutVectorsCommand } from '@aws-sdk/client-s3vectors';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });
const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

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

  // DDB update — after pending check, before VDB write
  const ddbSetParts: string[] = [];
  const ddbRemoveParts: string[] = [];
  const ddbValues: Record<string, any> = {};
  const ddbNames: Record<string, string> = {};

  if (updates.type !== undefined) {
    ddbSetParts.push('#t = :type');
    ddbValues[':type'] = updates.type;
    ddbNames['#t'] = 'type';
  }
  if (updates.topics !== undefined) {
    if (updates.topics.length > 0) {
      ddbSetParts.push('topics = :topics');
      ddbValues[':topics'] = updates.topics;
    } else {
      ddbRemoveParts.push('topics');
    }
  }
  if (updates.project !== undefined) {
    ddbSetParts.push('#project = :project');
    ddbValues[':project'] = updates.project;
    ddbNames['#project'] = 'project';
  }
  if (updates.summary !== undefined) {
    ddbSetParts.push('summary = :summary');
    ddbValues[':summary'] = updates.summary;
  }
  if (updates.people !== undefined) {
    if (updates.people.length > 0) {
      ddbSetParts.push('people = :people');
      ddbValues[':people'] = updates.people;
    } else {
      ddbRemoveParts.push('people');
    }
  }
  if (updates.action_items !== undefined) {
    if (updates.action_items.length > 0) {
      ddbSetParts.push('action_items = :action_items');
      ddbValues[':action_items'] = updates.action_items;
    } else {
      ddbRemoveParts.push('action_items');
    }
  }

  const updateParts: string[] = [];
  if (ddbSetParts.length > 0) updateParts.push(`SET ${ddbSetParts.join(', ')}`);
  if (ddbRemoveParts.length > 0) updateParts.push(`REMOVE ${ddbRemoveParts.join(', ')}`);

  if (updateParts.length > 0) {
    await ddb.send(new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: { pk: `THOUGHT#${id}`, sk: 'METADATA' },
      UpdateExpression: updateParts.join(' '),
      ...(Object.keys(ddbValues).length > 0 ? { ExpressionAttributeValues: ddbValues } : {}),
      ...(Object.keys(ddbNames).length > 0 ? { ExpressionAttributeNames: ddbNames } : {}),
    }));
  }

  await s3vectors.send(new PutVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    vectors: [{ key: id, data: existing.data, metadata: updatedMetadata }],
  }));

  return { success: true, metadata: updatedMetadata };
}
