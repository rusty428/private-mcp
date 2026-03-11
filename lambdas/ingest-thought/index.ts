import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createHmac, timingSafeEqual } from 'crypto';
import { invokeProcessThought } from './functions/invokeProcessThought';

const FIVE_MINUTES_SEC = 5 * 60;

function verifySlackSignature(event: APIGatewayProxyEvent): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error('SLACK_SIGNING_SECRET not configured — rejecting request');
    return false;
  }

  const timestamp = event.headers['X-Slack-Request-Timestamp'] || event.headers['x-slack-request-timestamp'];
  const signature = event.headers['X-Slack-Signature'] || event.headers['x-slack-signature'];

  if (!timestamp || !signature) {
    console.warn('Missing Slack signature headers');
    return false;
  }

  // Reject requests older than 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > FIVE_MINUTES_SEC) {
    console.warn('Slack request timestamp too old', { timestamp, now });
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${event.body || ''}`;
  const hmac = createHmac('sha256', signingSecret).update(sigBasestring).digest('hex');
  const expected = `v0=${hmac}`;

  // Use timing-safe comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');

    // Slack URL verification challenge — must respond before signature verification
    // is fully configured in Slack app setup flow
    if (body.type === 'url_verification') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge: body.challenge }),
      };
    }

    // Verify Slack request signature
    if (!verifySlackSignature(event)) {
      console.error('Invalid Slack signature — rejecting request', {
        ip: event.requestContext?.identity?.sourceIp,
        userAgent: event.headers['User-Agent'] || event.headers['user-agent'],
      });
      return { statusCode: 200, headers: {}, body: 'ok' };
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

    // Fire-and-forget: invoke process-thought asynchronously so Slack gets 200 within 3s
    await invokeProcessThought(messageText, 'slack', `slack_ts:${messageTs}`, {
      channel,
      threadTs: messageTs,
      botToken: process.env.SLACK_BOT_TOKEN || '',
    });

    return { statusCode: 200, headers: {}, body: 'ok' };
  } catch (err) {
    console.error('ingest-thought error:', { error: err instanceof Error ? err.message : err, stack: err instanceof Error ? err.stack : undefined });
    return { statusCode: 200, headers: {}, body: 'ok' };
  }
};
