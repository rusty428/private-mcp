import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { ProcessThoughtResult } from '../../../types/thought';

const lambda = new LambdaClient({ region: process.env.REGION });

export async function invokeProcessThought(
  text: string,
  source: string,
  sourceRef?: string
): Promise<ProcessThoughtResult> {
  const response = await lambda.send(new InvokeCommand({
    FunctionName: process.env.PROCESS_THOUGHT_FN_NAME,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({ text, source, sourceRef })),
  }));

  const payload = JSON.parse(new TextDecoder().decode(response.Payload));

  if (response.FunctionError) {
    throw new Error(`process-thought error: ${JSON.stringify(payload)}`);
  }

  return payload;
}
