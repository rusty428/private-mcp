import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { ProcessThoughtResult } from '../../../types/thought';

const lambda = new LambdaClient({ region: process.env.REGION });

interface CaptureParams {
  text: string;
  source?: string;
  project?: string;
  user_id?: string;
  team_id?: string;
}

export async function captureThought(params: CaptureParams): Promise<ProcessThoughtResult> {
  const { text, source = 'api', project, user_id, team_id } = params;
  const response = await lambda.send(new InvokeCommand({
    FunctionName: process.env.PROCESS_THOUGHT_FN_NAME,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({ text, source, project, user_id, team_id })),
  }));
  const payload = JSON.parse(new TextDecoder().decode(response.Payload));
  if (response.FunctionError) {
    console.error('process-thought error:', JSON.stringify(payload));
    throw new Error('Failed to process thought');
  }
  return payload;
}
