import { EnrichThoughtInput, ThoughtMetadata } from '../../types/thought';
import { stripFraming } from './functions/stripFraming';
import { classifyThought } from './functions/classifyThought';
import { generateEmbedding } from './functions/generateEmbedding';
import { storeThought } from './functions/storeThought';
import { loadSettings } from './functions/loadSettings';
import { buildPrompt } from './functions/buildPrompt';
import { resolveProjectAlias } from './functions/resolveProjectAlias';
import { loadPredicates } from './functions/loadPredicates';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

export const handler = async (event: EnrichThoughtInput): Promise<void> => {
  const { id, content, source, session_id, session_name, source_ref, thought_date, created_at, user_id, team_id } = event;

  const settings = await loadSettings();
  const predicates = await loadPredicates(team_id);
  const project = resolveProjectAlias(event.project, settings);

  const strippedContent = stripFraming(content, source);
  const systemPrompt = buildPrompt(settings, predicates);

  const classification = await classifyThought(strippedContent, source, project, {
    systemPrompt,
    modelId: settings.classificationModel,
    validTypes: settings.types,
    defaultType: settings.defaultType,
    validPredicates: predicates,
  });

  const normalizedRelatedProjects = classification.related_projects.map(
    (p) => resolveProjectAlias(p, settings)
  );

  const embedding = await generateEmbedding(classification.summary);

  const metadata: ThoughtMetadata = {
    content,
    summary: classification.summary,
    type: classification.type as ThoughtMetadata['type'],
    topics: classification.topics,
    people: classification.people,
    people_lower: classification.people.map(p => p.toLowerCase()),
    action_items: classification.action_items,
    dates_mentioned: classification.dates_mentioned,
    project,
    related_projects: normalizedRelatedProjects,
    source,
    source_ref,
    session_id,
    session_name,
    user_id,
    team_id,
    quality: classification.quality,
    thought_date,
    created_at,
  };

  await storeThought(id, embedding, metadata);

  // NOTE: Empty arrays are excluded intentionally — see storeThought.ts.
  // S3 Vectors rejects empty arrays in metadata, so DDB stays consistent with what's stored there.
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

  if (project !== event.project) {
    updateExprParts.push('#project = :project');
    exprValues[':project'] = project;
    exprNames['#project'] = 'project';
  }

  if (classification.topics.length > 0) {
    updateExprParts.push('topics = :topics');
    exprValues[':topics'] = classification.topics;
  }
  if (classification.people.length > 0) {
    updateExprParts.push('people = :people');
    exprValues[':people'] = classification.people;
    updateExprParts.push('people_lower = :people_lower');
    exprValues[':people_lower'] = classification.people.map(p => p.toLowerCase());
  }
  if (classification.action_items.length > 0) {
    updateExprParts.push('action_items = :action_items');
    exprValues[':action_items'] = classification.action_items;
  }
  if (classification.dates_mentioned.length > 0) {
    updateExprParts.push('dates_mentioned = :dates_mentioned');
    exprValues[':dates_mentioned'] = classification.dates_mentioned;
  }
  if (normalizedRelatedProjects.length > 0) {
    updateExprParts.push('related_projects = :related_projects');
    exprValues[':related_projects'] = normalizedRelatedProjects;
  }
  if (classification.raw_triples.length > 0) {
    updateExprParts.push('raw_triples = :raw_triples');
    exprValues[':raw_triples'] = classification.raw_triples;
  }

  await ddb.send(new UpdateCommand({
    TableName: process.env.TABLE_NAME,
    Key: { pk: `THOUGHT#${id}`, sk: 'METADATA' },
    UpdateExpression: updateExprParts.join(', '),
    ExpressionAttributeValues: exprValues,
    ExpressionAttributeNames: exprNames,
  }));
};
