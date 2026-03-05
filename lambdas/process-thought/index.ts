import { ProcessThoughtInput, ProcessThoughtResult, ThoughtMetadata } from '../../types/thought';
import { generateEmbedding } from './functions/generateEmbedding';
import { classifyThought } from './functions/classifyThought';
import { storeThought } from './functions/storeThought';
import { formatConfirmation } from './functions/formatConfirmation';
import { replyInSlack } from './functions/replyInSlack';
import { randomUUID } from 'crypto';

interface SlackReplyContext {
  channel: string;
  threadTs: string;
  botToken: string;
}

interface LambdaEvent {
  body?: string;
  source?: string;
  text?: string;
  sourceRef?: string;
  slackReply?: SlackReplyContext;
}

export const handler = async (event: LambdaEvent): Promise<ProcessThoughtResult> => {
  // Support direct Lambda invocation (from ingest-thought or mcp-server)
  const input: ProcessThoughtInput = event.text
    ? { text: event.text, source: (event.source as ProcessThoughtInput['source']) || 'api', sourceRef: event.sourceRef }
    : JSON.parse(event.body || '{}');

  if (!input.text || input.text.trim() === '') {
    throw new Error('Text is required');
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();

  const [embedding, classification] = await Promise.all([
    generateEmbedding(input.text),
    classifyThought(input.text),
  ]);

  const metadata: ThoughtMetadata = {
    content: input.text,
    type: classification.type,
    topics: classification.topics,
    people: classification.people,
    action_items: classification.action_items,
    dates_mentioned: classification.dates_mentioned,
    source: input.source,
    source_ref: input.sourceRef,
    created_at: createdAt,
  };

  await storeThought(id, embedding, metadata);

  const result: ProcessThoughtResult = {
    id,
    type: classification.type,
    topics: classification.topics,
    people: classification.people,
    action_items: classification.action_items,
    created_at: createdAt,
  };

  // Reply in Slack thread if this was triggered from Slack
  if (event.slackReply?.botToken) {
    const confirmation = formatConfirmation(result);
    await replyInSlack(
      event.slackReply.channel,
      event.slackReply.threadTs,
      event.slackReply.botToken,
      confirmation
    );
  }

  return result;
};
