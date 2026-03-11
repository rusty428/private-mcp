import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { ProcessThoughtResult } from '../../../types/thought';
import { MAX_TEXT_LENGTH } from '../../../types/validation';

const lambda = new LambdaClient({ region: process.env.REGION });

export async function captureThought(
  text: string,
  source: string = 'mcp',
  project?: string,
  session_id?: string,
  session_name?: string,
): Promise<ProcessThoughtResult> {
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Text too long. Maximum ${MAX_TEXT_LENGTH} characters, got ${text.length}.`);
  }

  const response = await lambda.send(new InvokeCommand({
    FunctionName: process.env.PROCESS_THOUGHT_FN_NAME,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({ text, source, project, session_id, session_name })),
  }));

  const payload = JSON.parse(new TextDecoder().decode(response.Payload));

  if (response.FunctionError) {
    throw new Error(`process-thought error: ${JSON.stringify(payload)}`);
  }

  return payload;
}
