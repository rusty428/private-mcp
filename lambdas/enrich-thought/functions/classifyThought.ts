import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

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
}

export interface ClassifyOptions {
  systemPrompt: string;
  modelId: string;
  validTypes: string[];
  defaultType: string;
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
      type: options.defaultType,
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
