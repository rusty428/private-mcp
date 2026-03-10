import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { CLASSIFICATION_MODEL_ID } from '../../../types/config';
import { ThoughtType, ThoughtQuality, VALID_THOUGHT_TYPES } from '../../../types/thought';

const bedrock = new BedrockRuntimeClient({ region: process.env.REGION });

export interface EnrichmentClassification {
  type: ThoughtType;
  topics: string[];
  people: string[];
  action_items: string[];
  dates_mentioned: string[];
  related_projects: string[];
  summary: string;
  quality: ThoughtQuality;
}

const SYSTEM_PROMPT = `You are a metadata extractor for a personal knowledge management system. Given a thought with its source context, extract structured metadata and produce a normalized summary.

Return JSON with these fields:

- "type": one of: observation, task, idea, reference, person_note, decision, project_summary, milestone
- "topics": array of 2-5 short lowercase topic tags
- "people": array of actual human names mentioned (not products, companies, technologies, or AI models)
- "action_items": array of explicit to-dos that haven't been done yet
- "dates_mentioned": array of dates in YYYY-MM-DD format (empty if none)
- "related_projects": array of project names referenced in the content (other than the primary project)
- "summary": 1-2 sentence normalized summary capturing the essential meaning. Write as a standalone statement, not referencing "the user" or "this thought". This summary will be used for semantic search embedding.
- "quality": "high" if this contains an architectural decision, milestone, or significant insight. "standard" for normal content. "noise" if this is trivial or not worth indexing.

Source-specific guidance:
- "mcp" source: Intentional capture. Trust the content. Likely high quality.
- "user-prompt" source: Captured automatically from user input. Extract the intent. Be skeptical of action items — the user may be asking, not committing.
- "session-summary" / "session-hook" source: Session boundary data. Extract key outcomes and decisions.
- "slack" source: Conversational. May need more normalization in the summary.

Rules:
- Only extract what is explicitly stated. Do not infer.
- "people" must be real human names. "Haiku", "Jeep", "WERA", "Bedrock", "Claude" are NOT people.
- "action_items" are things still needing to be done. Completed work is not an action item.
- Return valid JSON only, no other text.`;

export async function classifyThought(
  content: string,
  source: string,
  project: string
): Promise<EnrichmentClassification> {
  const userMessage = `Source: ${source}\nProject: ${project || 'unknown'}\nContent: ${content}`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: CLASSIFICATION_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userMessage }],
      system: SYSTEM_PROMPT,
    }),
  }));

  const result = JSON.parse(new TextDecoder().decode(response.body));
  const text = result.content[0].text;

  try {
    const parsed = JSON.parse(text);
    if (!VALID_THOUGHT_TYPES.includes(parsed.type)) {
      parsed.type = 'observation';
    }
    parsed.topics = (parsed.topics || []).map((t: string) => t.toLowerCase());
    if (!parsed.summary || parsed.summary.trim() === '') {
      parsed.summary = content.slice(0, 200);
    }
    if (!['high', 'standard', 'noise'].includes(parsed.quality)) {
      parsed.quality = 'standard';
    }
    return {
      type: parsed.type,
      topics: parsed.topics || [],
      people: parsed.people || [],
      action_items: parsed.action_items || [],
      dates_mentioned: parsed.dates_mentioned || [],
      related_projects: parsed.related_projects || [],
      summary: parsed.summary,
      quality: parsed.quality,
    };
  } catch {
    return {
      type: 'observation',
      topics: ['uncategorized'],
      people: [],
      action_items: [],
      dates_mentioned: [],
      related_projects: [],
      summary: content.slice(0, 200),
      quality: 'standard',
    };
  }
}
