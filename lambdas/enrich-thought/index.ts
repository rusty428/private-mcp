import { EnrichThoughtInput, ThoughtMetadata } from '../../types/thought';
import { stripFraming } from './functions/stripFraming';
import { classifyThought } from './functions/classifyThought';
import { generateEmbedding } from './functions/generateEmbedding';
import { storeThought } from './functions/storeThought';

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
};
