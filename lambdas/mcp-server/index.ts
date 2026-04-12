import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { searchThoughts } from './functions/searchThoughts';
import { browseRecent } from './functions/browseRecent';
import { getStats } from './functions/getStats';
import { captureThought } from './functions/captureThought';
import { invokeDailySummary } from './functions/invokeDailySummary';
import { kgQuery } from './functions/kgQuery';
import { kgAdd } from './functions/kgAdd';
import { kgInvalidate } from './functions/kgInvalidate';
import { kgTimeline } from './functions/kgTimeline';
import { kgPredicates } from './functions/kgPredicates';
import { findConnections } from './functions/findConnections';
import { exploreTopic } from './functions/exploreTopic';
import { explorePerson } from './functions/explorePerson';
import { SOURCE_REGEX, SOURCE_FORMAT_DESCRIPTION, MAX_PROJECT_LENGTH, MAX_SESSION_FIELD_LENGTH, DATE_REGEX, MAX_ENTITY_NAME_LENGTH, MAX_PREDICATE_LENGTH } from '../../types/validation';
import { AuthorizerContext } from '../../types/identity';

function createServer(userContext: AuthorizerContext): McpServer {
  const server = new McpServer({
    name: 'private-mcp',
    version: '2.2.0',
  });

  server.registerTool(
    'search_thoughts',
    {
      title: 'Search Thoughts',
      description: 'Search your brain by meaning. Returns thoughts semantically similar to your query.',
      inputSchema: {
        query: z.string().describe('What to search for - natural language'),
        limit: z.number().optional().default(10).describe('Max results to return'),
        threshold: z.number().optional().default(0.5).describe('Similarity threshold (0=exact, 2=opposite). Lower = stricter.'),
        project: z.string().optional().describe('Filter to a specific project'),
        since: z.string().optional().describe('Time filter: today, yesterday, this week, last week, this month, last month, N days ago, or YYYY-MM-DD'),
      },
    },
    async ({ query, limit, threshold, project, since }) => {
      const results = await searchThoughts(query, limit, threshold, project, since, userContext.team_id);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.registerTool(
    'browse_recent',
    {
      title: 'Browse Recent Thoughts',
      description: 'List recent thoughts, optionally filtered by type, topic, or project.',
      inputSchema: {
        limit: z.number().optional().default(20).describe('Max results'),
        type: z.string().optional().describe('Filter by type: observation, task, idea, reference, person_note, decision, project_summary, milestone'),
        topic: z.string().optional().describe('Filter by topic tag'),
        project: z.string().optional().describe('Filter to a specific project'),
      },
    },
    async ({ limit, type, topic, project }) => {
      const results = await browseRecent(limit, type, topic, project, userContext.team_id);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.registerTool(
    'stats',
    {
      title: 'Brain Stats',
      description: 'Get an overview of your brain: total thoughts, breakdown by type, top topics, date range.',
    },
    async () => {
      const stats = await getStats(userContext.team_id);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(stats, null, 2) }],
      };
    }
  );

  server.registerTool(
    'capture_thought',
    {
      title: 'Capture Thought',
      description: 'Save a thought to your brain. It gets embedded, classified, and stored automatically.',
      inputSchema: {
        text: z.string().describe('The thought to capture'),
        source: z.string().regex(SOURCE_REGEX).optional().default('mcp').describe(`Where this thought came from (${SOURCE_FORMAT_DESCRIPTION})`),
        project: z.string().max(MAX_PROJECT_LENGTH).optional().describe('Project name this thought relates to'),
        session_id: z.string().max(MAX_SESSION_FIELD_LENGTH).optional().describe('Claude Code session ID'),
        session_name: z.string().max(MAX_SESSION_FIELD_LENGTH).optional().describe('Claude Code session name (/rename label)'),
      },
    },
    async ({ text, source, project, session_id, session_name }) => {
      const result = await captureThought(text, source, project, session_id, session_name, userContext.user_id, userContext.team_id);
      let confirmation = `Captured (${result.quality})`;
      if (result.quality === 'noise') {
        confirmation += ' — stored but won\'t appear in search';
      } else {
        confirmation += ' — enrichment processing async';
      }
      return {
        content: [{ type: 'text' as const, text: confirmation }],
      };
    }
  );

  server.registerTool(
    'daily_summary',
    {
      title: 'Daily Summary',
      description: 'Generate and post today\'s daily summary to Slack. Returns the summary text.',
    },
    async () => {
      const result = await invokeDailySummary(userContext.team_id);
      return {
        content: [{ type: 'text' as const, text: result.text }],
      };
    }
  );

  server.registerTool(
    'kg_query',
    {
      title: 'Knowledge Graph Query',
      description: 'Get all relationships for an entity. Returns outgoing and incoming edges with temporal validity.',
      inputSchema: {
        entity: z.string().max(MAX_ENTITY_NAME_LENGTH).describe('Entity name (e.g., "Kai", "auth-migration")'),
        as_of: z.string().regex(DATE_REGEX).optional().describe('Date (YYYY-MM-DD) — only return facts valid at this time'),
        predicate: z.string().max(MAX_PREDICATE_LENGTH).optional().describe('Filter to a specific relationship type (e.g., "works_on")'),
        direction: z.enum(['outgoing', 'incoming', 'both']).optional().default('both').describe('Edge direction to query'),
      },
    },
    async ({ entity, as_of, predicate, direction }) => {
      const result = await kgQuery(entity, userContext.team_id, as_of, predicate, direction);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    'kg_add',
    {
      title: 'Knowledge Graph Add',
      description: 'Add a relationship fact. Auto-creates entities if they don\'t exist. Validates predicate against active vocabulary.',
      inputSchema: {
        subject: z.string().max(MAX_ENTITY_NAME_LENGTH).describe('Subject entity name'),
        predicate: z.string().max(MAX_PREDICATE_LENGTH).describe('Relationship type (e.g., "works_on", "owns")'),
        object: z.string().max(MAX_ENTITY_NAME_LENGTH).describe('Object entity name'),
        subject_type: z.enum(['person', 'project', 'topic']).optional().describe('Entity type for subject'),
        object_type: z.enum(['person', 'project', 'topic']).optional().describe('Entity type for object'),
      },
    },
    async ({ subject, predicate, object, subject_type, object_type }) => {
      const result = await kgAdd(subject, predicate, object, userContext.team_id, subject_type, object_type);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    'kg_invalidate',
    {
      title: 'Knowledge Graph Invalidate',
      description: 'Mark a relationship as no longer true. Sets the end date without deleting — history is preserved.',
      inputSchema: {
        subject: z.string().max(MAX_ENTITY_NAME_LENGTH).describe('Subject entity name'),
        predicate: z.string().max(MAX_PREDICATE_LENGTH).describe('Relationship type'),
        object: z.string().max(MAX_ENTITY_NAME_LENGTH).describe('Object entity name'),
        ended: z.string().regex(DATE_REGEX).optional().describe('When this stopped being true (YYYY-MM-DD). Defaults to today.'),
      },
    },
    async ({ subject, predicate, object, ended }) => {
      const result = await kgInvalidate(subject, predicate, object, userContext.team_id, ended);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    'kg_timeline',
    {
      title: 'Knowledge Graph Timeline',
      description: 'Chronological story of an entity — all facts involving it, ordered by time.',
      inputSchema: {
        entity: z.string().max(MAX_ENTITY_NAME_LENGTH).describe('Entity name'),
        limit: z.number().optional().default(50).describe('Max results'),
      },
    },
    async ({ entity, limit }) => {
      const result = await kgTimeline(entity, userContext.team_id, limit);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    'kg_predicates',
    {
      title: 'Knowledge Graph Predicates',
      description: 'View and manage the relationship vocabulary. List active predicates, add new ones, or remove existing ones.',
      inputSchema: {
        action: z.enum(['list', 'add', 'remove']).describe('Action to perform'),
        predicate: z.string().max(MAX_PREDICATE_LENGTH).optional().describe('Predicate name (required for add/remove)'),
      },
    },
    async ({ action, predicate }) => {
      const result = await kgPredicates(action, userContext.team_id, predicate);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    'find_connections',
    {
      title: 'Find Connections',
      description: 'Find what connects two projects — shared topics, shared people, and co-occurrence patterns.',
      inputSchema: {
        project_a: z.string().max(MAX_PROJECT_LENGTH).describe('First project name'),
        project_b: z.string().max(MAX_PROJECT_LENGTH).describe('Second project name'),
        min_occurrences: z.number().optional().default(1).describe('Minimum times a topic/person must appear to count'),
      },
    },
    async ({ project_a, project_b, min_occurrences }) => {
      const result = await findConnections(project_a, project_b, userContext.team_id, min_occurrences);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    'explore_topic',
    {
      title: 'Explore Topic',
      description: 'Explore a topic across the thought archive — which projects mention it, which people are connected to it, and recent activity.',
      inputSchema: {
        topic: z.string().describe("Topic tag to explore (e.g., 'auth', 'cdk', 'deploy')"),
        since: z.string().optional().describe('Optional date filter (YYYY-MM-DD)'),
      },
    },
    async ({ topic, since }) => {
      const result = await exploreTopic(topic, userContext.team_id, since);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    'explore_person',
    {
      title: 'Explore Person',
      description: 'Explore a person across the thought archive — which projects they appear in, what topics they\'re connected to, and recent mentions.',
      inputSchema: {
        person: z.string().describe("Person name (e.g., 'Kai', 'Maya')"),
        since: z.string().optional().describe('Optional date filter (YYYY-MM-DD)'),
      },
    },
    async ({ person, since }) => {
      const result = await explorePerson(person, userContext.team_id, since);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  return server;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;

  // GET and DELETE are not supported in stateless mode
  if (method === 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' }),
    };
  }
  if (method === 'DELETE') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Session termination not supported in stateless mode.' }),
    };
  }

  // Parse body
  let body: any = null;
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error: invalid JSON' },
          id: null,
        }),
      };
    }
  }

  // Reject batch requests
  if (Array.isArray(body)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Batch requests are not supported' },
        id: null,
      }),
    };
  }

  // Reject messages without a method (notifications have method but no id — that's fine)
  if (!body?.method) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid JSON-RPC message' },
        id: null,
      }),
    };
  }

  try {
    // Extract user context from API Gateway authorizer — fail closed if missing
    const authorizer = event.requestContext.authorizer || {};
    if (!authorizer.user_id || !authorizer.team_id) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Missing authorization context' },
          id: body?.id ?? null,
        }),
      };
    }
    const userContext: AuthorizerContext = {
      user_id: authorizer.user_id,
      username: authorizer.username || authorizer.user_id,
      team_id: authorizer.team_id,
      role: authorizer.role || 'member',
    };

    const server = createServer(userContext);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    // Build a Web Standard Request from the API Gateway event
    const host = event.headers?.Host || event.headers?.host || 'localhost';
    const path = event.path || '/mcp';
    const url = `https://${host}${path}`;
    const headers = new Headers();
    if (event.headers) {
      for (const [key, value] of Object.entries(event.headers)) {
        if (value) headers.set(key, value);
      }
    }
    // Ensure required headers for MCP SDK
    headers.set('content-type', 'application/json');
    if (!headers.has('accept')) {
      headers.set('accept', 'application/json, text/event-stream');
    }

    const request = new Request(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody: body });

    // Convert Web Standard Response to Lambda proxy response
    const responseBody = await response.text();
    const responseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    try { await transport.close(); } catch {}
    try { await server.close(); } catch {}

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: responseBody,
    };
  } catch (error) {
    console.error('MCP request handling failed:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      }),
    };
  }
};
