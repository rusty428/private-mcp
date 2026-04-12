import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { RawTriple, VALID_ENTITY_TYPES } from '../../../types/graph';

const bedrock = new BedrockRuntimeClient({ region: process.env.REGION });

export interface EnrichmentClassification {
  type: string;
  topics: string[];
  people: string[];
  action_items: string[];
  dates_mentioned: string[];
  related_projects: string[];
  summary: string;
  quality: 'high' | 'standard' | 'noise';
  raw_triples: RawTriple[];
}

export interface ClassifyOptions {
  systemPrompt: string;
  modelId: string;
  validTypes: string[];
  defaultType: string;
  validPredicates?: string[];
}

export async function classifyThought(
  content: string,
  source: string,
  project: string,
  options: ClassifyOptions,
): Promise<EnrichmentClassification> {
  const userMessage = `Source: ${source}\nProject: ${project || 'unknown'}\n<content>\n${content}\n</content>`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: options.modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userMessage }],
      system: options.systemPrompt,
    }),
  }));

  const result = JSON.parse(new TextDecoder().decode(response.body));
  const text = result.content[0].text;

  try {
    // NOTE: These fallbacks are load-bearing. The LLM classifier sometimes returns
    // types not in the taxonomy (e.g. "problem") or invalid quality values.
    // The guardrails below force outputs back to valid values.
    const parsed = JSON.parse(text);
    if (!options.validTypes.includes(parsed.type)) {
      parsed.type = options.defaultType;
    }
    parsed.topics = (parsed.topics || []).map((t: string) => t.toLowerCase());
    if (!parsed.summary || parsed.summary.trim() === '') {
      parsed.summary = content.slice(0, 200);
    }
    if (!['high', 'standard', 'noise'].includes(parsed.quality)) {
      parsed.quality = 'standard';
    }

    const rawTriples: RawTriple[] = [];
    if (Array.isArray(parsed.raw_triples) && options.validPredicates) {
      for (const t of parsed.raw_triples) {
        if (
          typeof t.subject === 'string' && t.subject.trim() &&
          typeof t.predicate === 'string' && options.validPredicates.includes(t.predicate) &&
          typeof t.object === 'string' && t.object.trim() &&
          VALID_ENTITY_TYPES.includes(t.subject_type) &&
          VALID_ENTITY_TYPES.includes(t.object_type) &&
          typeof t.confidence === 'number' && t.confidence >= 0 && t.confidence <= 1
        ) {
          rawTriples.push({
            subject: t.subject.trim().toLowerCase(),
            predicate: t.predicate,
            object: t.object.trim().toLowerCase(),
            subject_type: t.subject_type,
            object_type: t.object_type,
            confidence: t.confidence,
          });
        }
      }
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
      raw_triples: rawTriples,
    };
  } catch {
    return {
      type: options.defaultType,
      topics: ['uncategorized'],
      people: [],
      action_items: [],
      dates_mentioned: [],
      related_projects: [],
      summary: content.slice(0, 200),
      quality: 'standard',
      raw_triples: [],
    };
  }
}
