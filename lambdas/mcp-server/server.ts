import express, { Express } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { searchThoughts } from './functions/searchThoughts';
import { browseRecent } from './functions/browseRecent';
import { getStats } from './functions/getStats';
import { captureThought } from './functions/captureThought';
import { invokeDailySummary } from './functions/invokeDailySummary';

const app: Express = express();
app.use(express.json());

function createServer(): McpServer {
  const server = new McpServer({
    name: 'aws-private-mcp',
    version: '1.0.0',
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
      },
    },
    async ({ query, limit, threshold }) => {
      const results = await searchThoughts(query, limit, threshold);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.registerTool(
    'browse_recent',
    {
      title: 'Browse Recent Thoughts',
      description: 'List recent thoughts, optionally filtered by type or topic.',
      inputSchema: {
        limit: z.number().optional().default(20).describe('Max results'),
        type: z.string().optional().describe('Filter by type: observation, task, idea, reference, person_note'),
        topic: z.string().optional().describe('Filter by topic tag'),
      },
    },
    async ({ limit, type, topic }) => {
      const results = await browseRecent(limit, type, topic);
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
        source: z.string().optional().default('mcp').describe('Where this thought came from'),
      },
    },
    async ({ text, source }) => {
      const result = await captureThought(text, source);
      let confirmation = `Captured as *${result.type}*`;
      if (result.topics.length > 0) confirmation += ` - ${result.topics.join(', ')}`;
      if (result.people.length > 0) confirmation += `\nPeople: ${result.people.join(', ')}`;
      if (result.action_items.length > 0) confirmation += `\nAction items: ${result.action_items.join('; ')}`;
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
  const server = createServer();
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
});

app.get('/mcp', (_req, res) => {
  res.status(405).json({ error: 'Method not allowed. Use POST.' });
});

app.delete('/mcp', (_req, res) => {
  res.status(405).json({ error: 'Session termination not supported in stateless mode.' });
});

export { app };
