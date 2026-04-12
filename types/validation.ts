// Shared validation constants for input sanitization across Lambdas

export const MAX_TEXT_LENGTH = 10000;
export const MAX_QUERY_LENGTH = 1000;
export const MAX_LIST_LIMIT = 2000;
export const MAX_SEARCH_LIMIT = 100;
export const EXPLORE_TOP_K = 100;
export const MAX_PROJECT_LENGTH = 200;
export const MAX_SESSION_FIELD_LENGTH = 256;
export const MAX_ENTITY_NAME_LENGTH = 200;
export const MAX_PREDICATE_LENGTH = 100;

export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const VALID_THOUGHT_TYPES = [
  'observation',
  'task',
  'idea',
  'reference',
  'person_note',
  'decision',
  'project_summary',
  'milestone',
] as const;

export const VALID_CLASSIFICATION_MODELS = [
  'anthropic.claude-3-haiku-20240307-v1:0',
  'anthropic.claude-3-5-haiku-20241022-v1:0',
  'anthropic.claude-3-sonnet-20240229-v1:0',
  'anthropic.claude-3-5-sonnet-20241022-v2:0',
] as const;

export const SOURCE_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,48}[a-zA-Z0-9])?$/;
export const SOURCE_FORMAT_DESCRIPTION = 'alphanumeric and hyphens, 1-50 chars, no leading/trailing hyphens';

export function isValidSource(value: string): boolean {
  return SOURCE_REGEX.test(value);
}
