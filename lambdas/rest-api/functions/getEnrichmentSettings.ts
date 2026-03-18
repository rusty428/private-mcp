import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { EnrichmentSettings, DEFAULT_ENRICHMENT_SETTINGS } from '../../../types/settings';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

function buildGeneratedPrompt(settings: EnrichmentSettings): string {
  const typesLine = settings.types.join(', ');

  const projectNames = Object.keys(settings.projects);
  const projectsSection = projectNames.length > 0
    ? `\nKnown projects: ${projectNames.join(', ')}. When a thought references one of these projects, use the exact name listed. If a thought references a project not in this list, use a clear, consistent name for it.\n`
    : '';

  const specialSection = settings.specialInstructions
    ? `\n${settings.specialInstructions}\n`
    : '';

  return `You are a metadata extractor for a personal knowledge management system. Given a thought with its source context, extract structured metadata and produce a normalized summary.

Return JSON with these fields:

- "type": one of: ${typesLine}
- "topics": array of 2-5 short lowercase topic tags
- "people": array of actual human names mentioned (not products, companies, technologies, or AI models)
- "action_items": array of explicit to-dos that haven't been done yet
- "dates_mentioned": array of dates in YYYY-MM-DD format (empty if none)
- "related_projects": array of project names referenced in the content (other than the primary project). Use consistent canonical names -- match the project name format given in the Project field (e.g., if the primary project is "PrivateMCP", use that exact casing/format for references to it, and use similarly precise names for other projects). Do not create variations like abbreviations or lowercase versions.
- "summary": 1-2 sentence normalized summary capturing the essential meaning. Write as a standalone statement, not referencing "the user" or "this thought". This summary will be used for semantic search embedding.
- "quality": "high" if this contains an architectural decision, milestone, or significant insight. "standard" for normal content. "noise" if this is trivial or not worth indexing.
${projectsSection}
Source-specific guidance:
- "mcp" source: Intentional capture. Trust the content. Likely high quality.
- "user-prompt" source: Captured automatically from user input. Extract the intent. Be skeptical of action items -- the user may be asking, not committing.
- "session-summary" / "session-hook" source: Session boundary data. Extract key outcomes and decisions.
- "slack" source: Conversational. May need more normalization in the summary.
${specialSection}
Rules:
- Only extract what is explicitly stated. Do not infer.
- "people" must be real human names. "Haiku", "Jeep", "WERA", "Bedrock", "Claude" are NOT people.
- "action_items" are things still needing to be done. Completed work is not an action item.
- Return valid JSON only, no other text.`;
}

export async function getEnrichmentSettings(): Promise<EnrichmentSettings & { generatedPrompt: string }> {
  const result = await ddb.send(new GetCommand({
    TableName: process.env.SETTINGS_TABLE_NAME,
    Key: { pk: 'enrichment', sk: 'config' },
  }));

  const stored = result.Item as Partial<EnrichmentSettings> | undefined;

  // Merge with defaults for forward compatibility
  const settings: EnrichmentSettings = {
    types: stored?.types ?? DEFAULT_ENRICHMENT_SETTINGS.types,
    defaultType: stored?.defaultType ?? DEFAULT_ENRICHMENT_SETTINGS.defaultType,
    projects: stored?.projects ?? DEFAULT_ENRICHMENT_SETTINGS.projects,
    classificationModel: stored?.classificationModel ?? DEFAULT_ENRICHMENT_SETTINGS.classificationModel,
    specialInstructions: stored?.specialInstructions ?? DEFAULT_ENRICHMENT_SETTINGS.specialInstructions,
    customPrompt: stored?.customPrompt ?? DEFAULT_ENRICHMENT_SETTINGS.customPrompt,
    timezone: stored?.timezone ?? DEFAULT_ENRICHMENT_SETTINGS.timezone,
    updatedAt: stored?.updatedAt ?? DEFAULT_ENRICHMENT_SETTINGS.updatedAt,
  };

  const generatedPrompt = buildGeneratedPrompt(settings);

  return { ...settings, generatedPrompt };
}
