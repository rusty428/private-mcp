import { EnrichThoughtInput, ThoughtMetadata } from '../../types/thought';
import { stripFraming } from './functions/stripFraming';
import { classifyThought } from './functions/classifyThought';
import { generateEmbedding } from './functions/generateEmbedding';
import { storeThought } from './functions/storeThought';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

export const handler = async (event: EnrichThoughtInput): Promise<void> => {
  const { id, content, source, project, session_id, session_name, source_ref, thought_date, created_at } = event;

  const strippedContent = stripFraming(content, source);
  const classification = await classifyThought(strippedContent, source, project);
  const embedding = await generateEmbedding(classification.summary);

  const metadata: ThoughtMetadata = {
    content,
    summary: classification.summary,
    type: classification.type,
    topics: classification.topics,
    people: classification.people,
    action_items: classification.action_items,
    dates_mentioned: classification.dates_mentioned,
    project,
    related_projects: classification.related_projects,
    source: source as ThoughtMetadata['source'],
    source_ref,
    session_id,
    session_name,
    quality: classification.quality,
    thought_date,
    created_at,
  };

  await storeThought(id, embedding, metadata);

  const updateExprParts: string[] = [
    'SET enriched = :enriched',
    '#t = :type',
    'summary = :summary',
    'quality = :quality',
  ];
  const exprValues: Record<string, any> = {
    ':enriched': true,
    ':type': classification.type,
    ':summary': classification.summary,
    ':quality': classification.quality,
  };
  const exprNames: Record<string, string> = { '#t': 'type' };

  if (classification.topics.length > 0) {
    updateExprParts.push('topics = :topics');
    exprValues[':topics'] = classification.topics;
  }
  if (classification.people.length > 0) {
    updateExprParts.push('people = :people');
    exprValues[':people'] = classification.people;
  }
  if (classification.action_items.length > 0) {
    updateExprParts.push('action_items = :action_items');
    exprValues[':action_items'] = classification.action_items;
  }
  if (classification.dates_mentioned.length > 0) {
    updateExprParts.push('dates_mentioned = :dates_mentioned');
    exprValues[':dates_mentioned'] = classification.dates_mentioned;
  }
  if (classification.related_projects.length > 0) {
    updateExprParts.push('related_projects = :related_projects');
    exprValues[':related_projects'] = classification.related_projects;
  }

  await ddb.send(new UpdateCommand({
    TableName: process.env.TABLE_NAME,
    Key: { pk: `THOUGHT#${id}`, sk: 'METADATA' },
    UpdateExpression: updateExprParts.join(', '),
    ExpressionAttributeValues: exprValues,
    ExpressionAttributeNames: exprNames,
  }));
};
