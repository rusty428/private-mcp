import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({ region: process.env.REGION });

interface SlackReplyContext {
  channel: string;
  threadTs: string;
  botToken: string;
}

export async function invokeProcessThought(
  text: string,
  source: string,
  sourceRef?: string,
  slackReply?: SlackReplyContext
): Promise<void> {
  await lambda.send(new InvokeCommand({
    FunctionName: process.env.PROCESS_THOUGHT_FN_NAME,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify({ text, source, sourceRef, slackReply })),
  }));
}
