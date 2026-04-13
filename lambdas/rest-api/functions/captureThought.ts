import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { ProcessThoughtResult } from '../../../types/thought';

const lambda = new LambdaClient({ region: process.env.REGION });

interface CaptureParams {
  text: string;
  source?: string;
  sourceRef?: string;
  project?: string;
  session_id?: string;
  session_name?: string;
  thought_date?: string;
  created_at?: string;
  user_id?: string;
  team_id?: string;
}

export async function captureThought(params: CaptureParams): Promise<ProcessThoughtResult> {
  const {
    text,
    source = 'api',
    sourceRef,
    project,
    session_id,
    session_name,
    thought_date,
    created_at,
    user_id,
    team_id,
  } = params;

  const response = await lambda.send(new InvokeCommand({
    FunctionName: process.env.PROCESS_THOUGHT_FN_NAME,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({
      text,
      source,
      sourceRef,
      project,
      session_id,
      session_name,
      thought_date,
      created_at,
      user_id,
      team_id,
    })),
  }));
  const payload = JSON.parse(new TextDecoder().decode(response.Payload));
  if (response.FunctionError) {
    console.error('process-thought error:', JSON.stringify(payload));
    throw new Error('Failed to process thought');
  }
  return payload;
}
