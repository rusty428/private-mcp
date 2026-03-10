import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { EMBEDDING_MODEL_ID, VECTOR_DIMENSIONS } from '../../../types/config';

const bedrock = new BedrockRuntimeClient({ region: process.env.REGION });

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await bedrock.send(new InvokeModelCommand({
    modelId: EMBEDDING_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      inputText: text,
      dimensions: VECTOR_DIMENSIONS,
      normalize: true,
    }),
  }));

  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.embedding;
}
