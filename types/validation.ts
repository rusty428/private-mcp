// Shared validation constants for input sanitization across Lambdas

export const MAX_TEXT_LENGTH = 10000;
export const MAX_QUERY_LENGTH = 1000;
export const MAX_LIST_LIMIT = 2000;
export const MAX_SEARCH_LIMIT = 100;

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

export const VALID_SOURCES = [
  'mcp',
  'slack',
  'api',
  'session-summary',
  'session-hook',
  'user-prompt',
] as const;
