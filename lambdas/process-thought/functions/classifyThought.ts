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

const SYSTEM_PROMPT = `Extract metadata from the user's captured thought. Return JSON with:
- "people": array of people mentioned (empty if none)
- "action_items": array of implied to-dos (empty if none)
- "dates_mentioned": array of dates YYYY-MM-DD (empty if none)
- "topics": array of 1-3 short topic tags (always at least one)
- "type": one of "observation", "task", "idea", "reference", "person_note"
Only extract what's explicitly there. Return valid JSON only.`;

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
    return JSON.parse(content);
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
