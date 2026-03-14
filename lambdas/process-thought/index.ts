import { ProcessThoughtInput, ProcessThoughtResult, ThoughtMetadata, EnrichThoughtInput } from '../../types/thought';
import { MAX_TEXT_LENGTH } from '../../types/validation';
import { triageThought } from './functions/triageThought';
import { getPlaceholderVector } from './functions/placeholderVector';
import { storeThought } from './functions/storeThought';
import { formatConfirmation } from './functions/formatConfirmation';
import { replyInSlack } from './functions/replyInSlack';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const lambda = new LambdaClient({ region: process.env.REGION });
const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

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
  project?: string;
  session_id?: string;
  session_name?: string;
  slackReply?: SlackReplyContext;
}

export const handler = async (event: LambdaEvent): Promise<ProcessThoughtResult> => {
  const input: ProcessThoughtInput = event.text
    ? {
        text: event.text,
        source: (event.source as ProcessThoughtInput['source']) || 'api',
        sourceRef: event.sourceRef,
        project: event.project,
        session_id: event.session_id,
        session_name: event.session_name,
      }
    : JSON.parse(event.body || '{}');

  if (!input.text || input.text.trim() === '') {
    throw new Error('Text is required');
  }

  if (input.text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Text too long. Maximum ${MAX_TEXT_LENGTH} characters, got ${input.text.length}.`);
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const thoughtDate = createdAt.slice(0, 10);

  const quality = triageThought(input.text, input.source);

  const metadata: ThoughtMetadata = {
    content: input.text,
    summary: '',
    type: quality === 'noise' ? 'observation' : 'pending' as any,
    topics: [],
    people: [],
    action_items: [],
    dates_mentioned: [],
    project: input.project || '',
    related_projects: [],
    source: input.source,
    source_ref: input.sourceRef || '',
    session_id: input.session_id || '',
    session_name: input.session_name || '',
    quality,
    thought_date: thoughtDate,
    created_at: createdAt,
  };

  // DDB write first — UI source of truth
  const month = (metadata.thought_date || metadata.created_at).slice(0, 7);
  const { topics, people, action_items, dates_mentioned, related_projects, ...metadataRest } = metadata;
  const ddbItem: Record<string, any> = {
    pk: `THOUGHT#${id}`,
    sk: 'METADATA',
    month,
    enriched: false,
    ...metadataRest,
  };
  if (topics.length > 0) ddbItem.topics = topics;
  if (people.length > 0) ddbItem.people = people;
  if (action_items.length > 0) ddbItem.action_items = action_items;
  if (dates_mentioned.length > 0) ddbItem.dates_mentioned = dates_mentioned;
  if (related_projects.length > 0) ddbItem.related_projects = related_projects;

  await ddb.send(new PutCommand({ TableName: process.env.TABLE_NAME, Item: ddbItem }));

  if (metadata.project) {
    await ddb.send(new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: { pk: 'META#PROJECTS', sk: 'METADATA' },
      UpdateExpression: 'ADD projects :p',
      ExpressionAttributeValues: { ':p': new Set([metadata.project]) },
    }));
  }

  const vector = getPlaceholderVector();
  await storeThought(id, vector, metadata);

  const result: ProcessThoughtResult = {
    id,
    quality,
    thought_date: thoughtDate,
    created_at: createdAt,
  };

  if (quality !== 'noise' && process.env.ENRICH_THOUGHT_FN_NAME) {
    const enrichInput: EnrichThoughtInput = {
      id,
      content: input.text,
      source: input.source,
      project: input.project || '',
      session_id: input.session_id || '',
      session_name: input.session_name || '',
      source_ref: input.sourceRef || '',
      thought_date: thoughtDate,
      created_at: createdAt,
    };

    await lambda.send(new InvokeCommand({
      FunctionName: process.env.ENRICH_THOUGHT_FN_NAME,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(enrichInput)),
    }));
  }

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
