import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { listThoughts } from './functions/listThoughts';
import { getThought } from './functions/getThought';
import { editThought } from './functions/editThought';
import { deleteThought } from './functions/deleteThought';
import { searchThoughts } from './functions/searchThoughts';
import { captureThought } from './functions/captureThought';
import { getTimeSeries } from './functions/getTimeSeries';
import { generateNarrative } from './functions/generateNarrative';
import { getProjects } from './functions/getProjects';
import { getEnrichmentSettings } from './functions/getEnrichmentSettings';
import { putEnrichmentSettings } from './functions/putEnrichmentSettings';
import { AuthorizerContext } from '../../types/identity';
import {
  MAX_TEXT_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_LIST_LIMIT,
  MAX_SEARCH_LIMIT,
  UUID_REGEX,
  DATE_REGEX,
  VALID_THOUGHT_TYPES,
  isValidSource,
  SOURCE_FORMAT_DESCRIPTION,
  MAX_PROJECT_LENGTH,
} from '../../types/validation';

// --- Helpers ---

const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);

function isAllowedOrigin(origin: string): boolean {
  if (/^http:\/\/localhost:\d+$/.test(origin)) return true;
  return EXTRA_ORIGINS.includes(origin);
}

function corsHeaders(event: APIGatewayProxyEvent): Record<string, string> {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function jsonResponse(statusCode: number, body: unknown, event: APIGatewayProxyEvent): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders(event),
    body: JSON.stringify(body),
  };
}

function errorResponse(statusCode: number, message: string, event: APIGatewayProxyEvent): APIGatewayProxyResult {
  return jsonResponse(statusCode, { error: message }, event);
}

function getUserContext(event: APIGatewayProxyEvent): AuthorizerContext {
  const authorizer = event.requestContext.authorizer || {};
  return {
    user_id: authorizer.user_id || 'owner',
    username: authorizer.username || 'owner',
    team_id: authorizer.team_id || 'default',
    role: authorizer.role || 'admin',
  };
}

function parseBody(event: APIGatewayProxyEvent): any {
  if (!event.body) return {};
  return JSON.parse(event.body);
}

// --- Type cache ---

let cachedTypes: string[] | null = null;
let typesCacheTime = 0;
const TYPES_CACHE_TTL = 5 * 60 * 1000;

async function getValidTypes(): Promise<string[]> {
  const now = Date.now();
  if (cachedTypes && now - typesCacheTime < TYPES_CACHE_TTL) return cachedTypes;
  try {
    const settings = await getEnrichmentSettings();
    cachedTypes = settings.types;
    typesCacheTime = now;
    return cachedTypes;
  } catch {
    return VALID_THOUGHT_TYPES as unknown as string[];
  }
}

// --- Route handlers ---

async function handleListThoughts(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const q = event.queryStringParameters || {};
  const userContext = getUserContext(event);

  if (q.type) {
    const validTypes = await getValidTypes();
    if (!validTypes.includes(q.type)) {
      return errorResponse(400, `Invalid type. Must be one of: ${validTypes.join(', ')}`, event);
    }
  }
  if (q.startDate && !DATE_REGEX.test(q.startDate)) {
    return errorResponse(400, 'Invalid startDate format. Use YYYY-MM-DD.', event);
  }
  if (q.endDate && !DATE_REGEX.test(q.endDate)) {
    return errorResponse(400, 'Invalid endDate format. Use YYYY-MM-DD.', event);
  }
  const rawPageSize = q.pageSize ? parseInt(q.pageSize) : undefined;
  if (rawPageSize !== undefined && isNaN(rawPageSize)) {
    return errorResponse(400, 'pageSize must be a number.', event);
  }
  const pageSize = rawPageSize ? Math.min(rawPageSize, MAX_LIST_LIMIT) : undefined;
  const rawMaxRecords = q.maxRecords ? parseInt(q.maxRecords) : undefined;
  if (rawMaxRecords !== undefined && isNaN(rawMaxRecords)) {
    return errorResponse(400, 'maxRecords must be a number.', event);
  }
  const maxRecords = rawMaxRecords ? Math.min(rawMaxRecords, 5000) : undefined;
  if (q.project && q.project.length > MAX_PROJECT_LENGTH) {
    return errorResponse(400, `Project name too long. Maximum ${MAX_PROJECT_LENGTH} characters.`, event);
  }

  const results = await listThoughts({
    type: q.type,
    source: q.source,
    project: q.project,
    startDate: q.startDate,
    endDate: q.endDate,
    pageSize,
    nextToken: q.nextToken,
    maxRecords,
    includeCount: q.includeCount === 'true',
    team_id: userContext.team_id,
  });
  return jsonResponse(200, results, event);
}

async function handleGetThought(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const id = event.pathParameters?.id || '';
  if (!UUID_REGEX.test(id)) {
    return errorResponse(400, 'Invalid thought ID format. Must be a UUID.', event);
  }
  const result = await getThought(id);
  if (!result) return errorResponse(404, 'Thought not found', event);
  return jsonResponse(200, result, event);
}

async function handleEditThought(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const id = event.pathParameters?.id || '';
  if (!UUID_REGEX.test(id)) {
    return errorResponse(400, 'Invalid thought ID format. Must be a UUID.', event);
  }
  const body = parseBody(event);
  if (body.type) {
    const validTypes = await getValidTypes();
    if (!validTypes.includes(body.type)) {
      return errorResponse(400, `Invalid type. Must be one of: ${validTypes.join(', ')}`, event);
    }
  }
  const result = await editThought(id, body);
  if (result.error === 'not_found') return errorResponse(404, 'Thought not found', event);
  if (result.error === 'pending') return errorResponse(409, 'Cannot edit a thought that is still being processed', event);
  return jsonResponse(200, result, event);
}

async function handleDeleteThought(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const id = event.pathParameters?.id || '';
  if (!UUID_REGEX.test(id)) {
    return errorResponse(400, 'Invalid thought ID format. Must be a UUID.', event);
  }
  const result = await deleteThought(id);
  return jsonResponse(200, result, event);
}

async function handleSearch(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  const userContext = getUserContext(event);
  if (!body.query) return errorResponse(400, 'query is required', event);
  if (body.query.length > MAX_QUERY_LENGTH) {
    return errorResponse(400, `Query too long. Maximum ${MAX_QUERY_LENGTH} characters.`, event);
  }
  if (body.limit) {
    const parsedLimit = Number(body.limit);
    if (isNaN(parsedLimit)) return errorResponse(400, 'limit must be a number', event);
    body.limit = Math.min(parsedLimit, MAX_SEARCH_LIMIT);
  }
  if (body.threshold) {
    const parsedThreshold = Number(body.threshold);
    if (isNaN(parsedThreshold)) return errorResponse(400, 'threshold must be a number', event);
    body.threshold = parsedThreshold;
  }
  const results = await searchThoughts({ ...body, team_id: userContext.team_id });
  return jsonResponse(200, results, event);
}

async function handleCapture(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  const userContext = getUserContext(event);
  if (!body.text) return errorResponse(400, 'text is required', event);
  if (body.text.length > MAX_TEXT_LENGTH) {
    return errorResponse(400, `Text too long. Maximum ${MAX_TEXT_LENGTH} characters.`, event);
  }
  if (body.source && !isValidSource(body.source)) {
    return errorResponse(400, `Invalid source. Format: ${SOURCE_FORMAT_DESCRIPTION}`, event);
  }
  if (body.project && body.project.length > MAX_PROJECT_LENGTH) {
    return errorResponse(400, `Project name too long. Maximum ${MAX_PROJECT_LENGTH} characters.`, event);
  }
  const result = await captureThought({
    ...body,
    user_id: userContext.user_id,
    team_id: userContext.team_id,
  });
  return jsonResponse(200, result, event);
}

async function handleTimeSeries(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const q = event.queryStringParameters || {};
  if (q.startDate && !DATE_REGEX.test(q.startDate)) {
    return errorResponse(400, 'Invalid startDate format. Use YYYY-MM-DD.', event);
  }
  if (q.endDate && !DATE_REGEX.test(q.endDate)) {
    return errorResponse(400, 'Invalid endDate format. Use YYYY-MM-DD.', event);
  }
  if (q.interval && q.interval !== 'day' && q.interval !== 'week') {
    return errorResponse(400, 'Invalid interval. Must be "day" or "week".', event);
  }
  const results = await getTimeSeries({
    startDate: q.startDate,
    endDate: q.endDate,
    interval: q.interval as 'day' | 'week',
    project: q.project,
  });
  return jsonResponse(200, results, event);
}

async function handleGenerateReport(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  if (!body.startDate || !body.endDate) {
    return errorResponse(400, 'startDate and endDate are required', event);
  }
  if (!DATE_REGEX.test(body.startDate)) {
    return errorResponse(400, 'Invalid startDate format. Use YYYY-MM-DD.', event);
  }
  if (!DATE_REGEX.test(body.endDate)) {
    return errorResponse(400, 'Invalid endDate format. Use YYYY-MM-DD.', event);
  }
  const narrative = await generateNarrative(body);
  return jsonResponse(200, { narrative }, event);
}

async function handleGetProjects(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const projects = await getProjects();
  return jsonResponse(200, { projects }, event);
}

async function handleGetEnrichmentSettings(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const settings = await getEnrichmentSettings();
  return jsonResponse(200, settings, event);
}

async function handlePutEnrichmentSettings(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  const result = await putEnrichmentSettings(body);
  if (!result.success) {
    return errorResponse(400, result.error!, event);
  }
  cachedTypes = null;
  typesCacheTime = 0;
  return jsonResponse(200, result.settings, event);
}

// --- Router ---

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  const path = event.resource;

  // OPTIONS preflight
  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(event), body: '' };
  }

  try {
    // Route based on resource path + method (API Gateway resource patterns)
    switch (path) {
      case '/thoughts':
        if (method === 'GET') return await handleListThoughts(event);
        break;
      case '/thoughts/{id}':
        if (method === 'GET') return await handleGetThought(event);
        if (method === 'PUT') return await handleEditThought(event);
        if (method === 'DELETE') return await handleDeleteThought(event);
        break;
      case '/search':
        if (method === 'POST') return await handleSearch(event);
        break;
      case '/capture':
        if (method === 'POST') return await handleCapture(event);
        break;
      case '/stats/timeseries':
        if (method === 'GET') return await handleTimeSeries(event);
        break;
      case '/reports/generate':
        if (method === 'POST') return await handleGenerateReport(event);
        break;
      case '/projects':
        if (method === 'GET') return await handleGetProjects(event);
        break;
      case '/settings/enrichment':
        if (method === 'GET') return await handleGetEnrichmentSettings(event);
        if (method === 'PUT') return await handlePutEnrichmentSettings(event);
        break;
    }

    return errorResponse(404, 'Not found', event);
  } catch (err: any) {
    console.error('Request error:', { method, path, error: err.message, stack: err.stack });
    return errorResponse(500, 'Internal server error', event);
  }
};
