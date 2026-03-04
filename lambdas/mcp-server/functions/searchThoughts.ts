import { S3VectorsClient, QueryVectorsCommand } from '@aws-sdk/client-s3vectors';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { EMBEDDING_MODEL_ID, VECTOR_DIMENSIONS } from '../../../types/config';
import { ThoughtSearchResult } from '../../../types/thought';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });
const bedrock = new BedrockRuntimeClient({ region: process.env.REGION });

export async function searchThoughts(
  query: string,
  limit: number = 10,
  threshold: number = 0.5
): Promise<ThoughtSearchResult[]> {
  const embedResponse = await bedrock.send(new InvokeModelCommand({
    modelId: EMBEDDING_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      inputText: query,
      dimensions: VECTOR_DIMENSIONS,
      normalize: true,
    }),
  }));

  const embedResult = JSON.parse(new TextDecoder().decode(embedResponse.body));
  const queryVector = embedResult.embedding;

  const searchResponse = await s3vectors.send(new QueryVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    queryVector: { float32: queryVector },
    topK: limit,
    returnDistance: true,
    returnMetadata: true,
  }));

  if (!searchResponse.vectors) return [];

  return searchResponse.vectors
    .filter((v: any) => v.distance !== undefined && v.distance <= threshold)
    .map((v: any) => ({
      key: v.key,
      distance: v.distance,
      metadata: v.metadata,
    }));
}
