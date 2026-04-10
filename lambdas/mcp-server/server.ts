import express, { Express } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { searchThoughts } from './functions/searchThoughts';
import { browseRecent } from './functions/browseRecent';
import { getStats } from './functions/getStats';
import { captureThought } from './functions/captureThought';
import { invokeDailySummary } from './functions/invokeDailySummary';
import { SOURCE_REGEX, SOURCE_FORMAT_DESCRIPTION, MAX_PROJECT_LENGTH, MAX_SESSION_FIELD_LENGTH } from '../../types/validation';
import { AuthorizerContext } from '../../types/identity';

const app: Express = express();
app.use(express.json({ limit: '16kb' }));

// Extract user context from API Gateway authorizer
app.use((req: any, _res, next) => {
  const authorizer = req.apiGateway?.event?.requestContext?.authorizer;
  req.userContext = {
    user_id: authorizer?.user_id || 'owner',
    username: authorizer?.username || 'owner',
    team_id: authorizer?.team_id || 'default',
    role: authorizer?.role || 'admin',
  } as AuthorizerContext;
  next();
});

function createServer(userContext: AuthorizerContext): McpServer {
  const server = new McpServer({
    name: 'private-mcp',
    version: '1.1.1',
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
      const stats = await getStats();
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
      const result = await invokeDailySummary();
      return {
        content: [{ type: 'text' as const, text: result.text }],
      };
    }
  );

  return server;
}

app.post('/mcp', async (req, res) => {
  const body = req.body;

  // Reject batch requests — 1 HTTP request = 1 JSON-RPC message
  // Prevents amplification attacks that bypass API Gateway throttling
  if (Array.isArray(body)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Batch requests are not supported' },
      id: null,
    });
    return;
  }

  // Reject messages without a method (e.g. fabricated JSON-RPC responses)
  // NOTE: Notifications (method present, no id) are valid MCP protocol messages
  // (e.g. notifications/initialized). The SDK handles them natively (returns 202).
  if (!body?.method) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid JSON-RPC message' },
      id: null,
    });
    return;
  }

  // NOTE: Stateless mode — each request creates a fresh server+transport pair.
  // sessionIdGenerator: undefined disables session tracking. The MCP protocol
  // requires GET (SSE streams) and DELETE (session teardown) endpoints, but in
  // stateless mode they're no-ops. All three HTTP methods route to this Lambda
  // because API Gateway doesn't know which the client will use.
  try {
    const userContext: AuthorizerContext = (req as any).userContext;
    const server = createServer(userContext);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request handling failed:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

app.get('/mcp', (_req, res) => {
  res.status(405).json({ error: 'Method not allowed. Use POST.' });
});

app.delete('/mcp', (_req, res) => {
  res.status(405).json({ error: 'Session termination not supported in stateless mode.' });
});

export { app };
