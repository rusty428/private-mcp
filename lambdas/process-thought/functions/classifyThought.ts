import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { CLASSIFICATION_MODEL_ID } from '../../../types/config';
import { ThoughtType } from '../../../types/thought';

const bedrock = new BedrockRuntimeClient({ region: process.env.REGION });

interface ClassificationResult {
  type: ThoughtType;
  topics: string[];
  people: string[];
  action_items: string[];
  dates_mentioned: string[];
}

const SYSTEM_PROMPT = `Extract metadata from a captured thought or note. Return JSON with:

- "type": one of "observation", "task", "idea", "reference", "person_note", "decision", "project_summary", "milestone"
- "topics": array of 2-5 short topic tags, always lowercase
- "people": array of actual human names mentioned (not products, companies, organizations, or technologies)
- "action_items": array of explicit to-dos that haven't been done yet (not things already completed)
- "dates_mentioned": array of dates in YYYY-MM-DD format (empty if none)

Rules:
- Only extract what is explicitly stated. Do not infer or guess.
- "people" must be real human names. "Haiku", "Jeep", "WERA", "Bedrock" are NOT people.
- "action_items" are things still needing to be done. If the text describes something already completed, it is not an action item.
- Return valid JSON only, no other text.`;

export async function classifyThought(text: string): Promise<ClassificationResult> {
  const response = await bedrock.send(new InvokeModelCommand({
    modelId: CLASSIFICATION_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 512,
      messages: [
        { role: 'user', content: text },
      ],
      system: SYSTEM_PROMPT,
    }),
  }));

  const result = JSON.parse(new TextDecoder().decode(response.body));
  const content = result.content[0].text;

  try {
    const parsed = JSON.parse(content);
    parsed.topics = parsed.topics.map((t: string) => t.toLowerCase());
    return parsed;
  } catch {
    return {
      type: 'observation',
      topics: ['uncategorized'],
      people: [],
      action_items: [],
      dates_mentioned: [],
    };
  }
}
