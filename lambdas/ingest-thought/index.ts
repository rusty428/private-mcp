import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { invokeProcessThought } from './functions/invokeProcessThought';
import { replyInSlack } from './functions/replyInSlack';
import { formatConfirmation } from './functions/formatConfirmation';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');

    // Slack URL verification challenge
    if (body.type === 'url_verification') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge: body.challenge }),
      };
    }

    const slackEvent = body.event;

    // Filter: only message events, no bots, no subtypes, correct channel only
    if (
      !slackEvent ||
      slackEvent.type !== 'message' ||
      slackEvent.subtype ||
      slackEvent.bot_id ||
      slackEvent.channel !== process.env.SLACK_CAPTURE_CHANNEL
    ) {
      return { statusCode: 200, headers: {}, body: 'ok' };
    }

    const messageText: string = slackEvent.text;
    const channel: string = slackEvent.channel;
    const messageTs: string = slackEvent.ts;

    if (!messageText || messageText.trim() === '') {
      return { statusCode: 200, headers: {}, body: 'ok' };
    }

    const result = await invokeProcessThought(
      messageText,
      'slack',
      `slack_ts:${messageTs}`
    );

    const confirmation = formatConfirmation(result);
    await replyInSlack(channel, messageTs, confirmation);

    return { statusCode: 200, headers: {}, body: 'ok' };
  } catch (err) {
    console.error('ingest-thought error:', err);
    return { statusCode: 500, headers: {}, body: 'error' };
  }
};
