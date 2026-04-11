import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({ region: process.env.REGION });

interface SlackReplyContext {
  channel: string;
  threadTs: string;
  botToken: string;
}

// TODO: Slack ingest defaults to user_id='owner', team_id='default' because
// the /slack/events endpoint uses Slack HMAC verification (not the custom
// authorizer), so there's no identity context available. To support multi-team
// Slack capture, add a settings-table mapping from Slack workspace/channel to team.
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
