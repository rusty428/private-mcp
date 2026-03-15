import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { EnrichmentSettings } from '../../../types/settings';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

const TYPE_PATTERN = /^[a-z0-9_]+$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;

interface PutResult {
  success: boolean;
  settings?: EnrichmentSettings;
  error?: string;
}

export async function putEnrichmentSettings(body: any): Promise<PutResult> {
  // Validate types
  if (!Array.isArray(body.types) || body.types.length === 0) {
    return { success: false, error: 'types must be a non-empty array of strings' };
  }
  if (body.types.length > 20) {
    return { success: false, error: 'types array cannot exceed 20 entries' };
  }
  for (const t of body.types) {
    if (typeof t !== 'string' || !TYPE_PATTERN.test(t)) {
      return { success: false, error: `Invalid type "${t}". Must be lowercase alphanumeric with underscores.` };
    }
  }

  // Validate defaultType
  if (typeof body.defaultType !== 'string' || !body.types.includes(body.defaultType)) {
    return { success: false, error: `defaultType must be one of: ${body.types.join(', ')}` };
  }

  // Validate classificationModel
  if (typeof body.classificationModel !== 'string' || body.classificationModel.trim() === '') {
    return { success: false, error: 'classificationModel must be a non-empty string' };
  }

  // Validate projects
  if (typeof body.projects !== 'object' || body.projects === null || Array.isArray(body.projects)) {
    return { success: false, error: 'projects must be an object' };
  }

  const allAliases: Map<string, string> = new Map();
  for (const [key, value] of Object.entries(body.projects)) {
    if (key.length > 100) {
      return { success: false, error: `Project key "${key}" exceeds 100 characters` };
    }
    if (CONTROL_CHAR_PATTERN.test(key)) {
      return { success: false, error: `Project key "${key}" contains control characters` };
    }
    const proj = value as any;
    if (!proj || !Array.isArray(proj.aliases)) {
      return { success: false, error: `Project "${key}" must have an aliases array` };
    }
    for (const alias of proj.aliases) {
      if (typeof alias !== 'string') {
        return { success: false, error: `Alias in project "${key}" must be a string` };
      }
      const lower = alias.toLowerCase();
      if (allAliases.has(lower)) {
        return { success: false, error: `Duplicate alias "${alias}" found in project "${key}" (already used by "${allAliases.get(lower)}")` };
      }
      allAliases.set(lower, key);
    }
  }

  // Validate timezone
  if (typeof body.timezone !== 'string' || body.timezone.trim() === '') {
    return { success: false, error: 'timezone must be a non-empty IANA timezone string' };
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: body.timezone });
  } catch {
    return { success: false, error: `Invalid timezone: "${body.timezone}". Must be a valid IANA timezone (e.g., America/Los_Angeles).` };
  }

  // Validate specialInstructions
  const specialInstructions = body.specialInstructions ?? null;
  if (specialInstructions !== null) {
    if (typeof specialInstructions !== 'string') {
      return { success: false, error: 'specialInstructions must be a string or null' };
    }
    if (specialInstructions.length > 2000) {
      return { success: false, error: 'specialInstructions cannot exceed 2000 characters' };
    }
    if (CONTROL_CHAR_PATTERN.test(specialInstructions)) {
      return { success: false, error: 'specialInstructions contains control characters' };
    }
  }

  // Validate customPrompt
  const customPrompt = body.customPrompt ?? null;
  if (customPrompt !== null) {
    if (typeof customPrompt !== 'string') {
      return { success: false, error: 'customPrompt must be a string or null' };
    }
    if (customPrompt.length > 10000) {
      return { success: false, error: 'customPrompt cannot exceed 10000 characters' };
    }
  }

  const now = new Date().toISOString();

  const settings: EnrichmentSettings = {
    types: body.types,
    defaultType: body.defaultType,
    projects: body.projects,
    classificationModel: body.classificationModel,
    specialInstructions,
    customPrompt,
    timezone: body.timezone,
    updatedAt: now,
  };

  // Build DDB item, omitting null fields
  const item: Record<string, any> = {
    pk: 'enrichment',
    sk: 'config',
    types: settings.types,
    defaultType: settings.defaultType,
    projects: settings.projects,
    classificationModel: settings.classificationModel,
    timezone: settings.timezone,
    updatedAt: settings.updatedAt,
  };

  if (settings.specialInstructions !== null) {
    item.specialInstructions = settings.specialInstructions;
  }
  if (settings.customPrompt !== null) {
    item.customPrompt = settings.customPrompt;
  }

  await ddb.send(new PutCommand({
    TableName: process.env.SETTINGS_TABLE_NAME,
    Item: item,
  }));

  return { success: true, settings };
}
