import { S3VectorsClient, QueryVectorsCommand } from '@aws-sdk/client-s3vectors';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { EMBEDDING_MODEL_ID, VECTOR_DIMENSIONS } from '../../../types/config';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });
const bedrock = new BedrockRuntimeClient({ region: process.env.REGION });

interface SearchParams {
  query: string;
  limit?: number;
  threshold?: number;
  project?: string;
  team_id?: string;
}

export async function searchThoughts(params: SearchParams) {
  const { query, limit = 20, threshold = 0.7, project, team_id } = params;

  const embedResponse = await bedrock.send(new InvokeModelCommand({
    modelId: EMBEDDING_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({ inputText: query, dimensions: VECTOR_DIMENSIONS, normalize: true }),
  }));

  const embedResult = JSON.parse(new TextDecoder().decode(embedResponse.body));
  const queryVector = embedResult.embedding;

  const filterConditions: any[] = [{
    '$or': [
      { quality: { '$ne': 'noise' } },
      { quality: { '$exists': false } },
    ],
  }];

  if (project) {
    filterConditions.push({ project: { '$eq': project } });
  }

  if (team_id) {
    filterConditions.push({ team_id: { '$eq': team_id } });
  }

  const filter = filterConditions.length === 1 ? filterConditions[0] : { '$and': filterConditions };

  const response = await s3vectors.send(new QueryVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    queryVector: { float32: queryVector },
    topK: Math.min(limit * 2, 100),
    returnDistance: true,
    returnMetadata: true,
    filter,
  }));

  if (!response.vectors) return [];

  return response.vectors
    .filter((v: any) => v.distance !== undefined && v.distance <= threshold)
    .map((v: any) => ({ key: v.key, distance: v.distance, metadata: v.metadata }))
    .slice(0, limit);
}
