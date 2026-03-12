import express, { Express } from 'express';
import { listThoughts } from './functions/listThoughts';
import { getThought } from './functions/getThought';
import { editThought } from './functions/editThought';
import { deleteThought } from './functions/deleteThought';
import { searchThoughts } from './functions/searchThoughts';
import { captureThought } from './functions/captureThought';
import { getTimeSeries } from './functions/getTimeSeries';
import { generateNarrative } from './functions/generateNarrative';
import {
  MAX_TEXT_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_LIST_LIMIT,
  MAX_SEARCH_LIMIT,
  UUID_REGEX,
  DATE_REGEX,
  VALID_THOUGHT_TYPES,
  VALID_SOURCES,
} from '../../types/validation';

const app: Express = express();
app.use(express.json({ limit: '50kb' }));

// CORS headers — required for browser requests via Lambda proxy integration
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);

function isAllowedOrigin(origin: string): boolean {
  if (/^http:\/\/localhost:\d+$/.test(origin)) return true;
  return EXTRA_ORIGINS.includes(origin);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/thoughts', async (req, res) => {
  try {
    const type = req.query.type as string;
    if (type && !VALID_THOUGHT_TYPES.includes(type as any)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_THOUGHT_TYPES.join(', ')}` });
    }
    const startDate = req.query.startDate as string;
    if (startDate && !DATE_REGEX.test(startDate)) {
      return res.status(400).json({ error: 'Invalid startDate format. Use YYYY-MM-DD.' });
    }
    const endDate = req.query.endDate as string;
    if (endDate && !DATE_REGEX.test(endDate)) {
      return res.status(400).json({ error: 'Invalid endDate format. Use YYYY-MM-DD.' });
    }
    const rawLimit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const limit = rawLimit ? Math.min(rawLimit, MAX_LIST_LIMIT) : undefined;

    const results = await listThoughts({
      type,
      source: req.query.source as string,
      project: req.query.project as string,
      startDate,
      endDate,
      limit,
    });
    res.json(results);
  } catch (err: any) {
    console.error('listThoughts error:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

app.get('/thoughts/:id', async (req, res) => {
  try {
    if (!UUID_REGEX.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid thought ID format. Must be a UUID.' });
    }
    const result = await getThought(req.params.id);
    if (!result) return res.status(404).json({ error: 'Thought not found' });
    res.json(result);
  } catch (err: any) {
    console.error('getThought error:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

app.put('/thoughts/:id', async (req, res) => {
  try {
    if (!UUID_REGEX.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid thought ID format. Must be a UUID.' });
    }
    if (req.body.type && !VALID_THOUGHT_TYPES.includes(req.body.type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_THOUGHT_TYPES.join(', ')}` });
    }
    const result = await editThought(req.params.id, req.body);
    if (result.error === 'not_found') return res.status(404).json({ error: 'Thought not found' });
    if (result.error === 'pending') return res.status(409).json({ error: 'Cannot edit a thought that is still being processed' });
    res.json(result);
  } catch (err: any) {
    console.error('editThought error:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/thoughts/:id', async (req, res) => {
  try {
    if (!UUID_REGEX.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid thought ID format. Must be a UUID.' });
    }
    const result = await deleteThought(req.params.id);
    res.json(result);
  } catch (err: any) {
    console.error('deleteThought error:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

app.post('/search', async (req, res) => {
  try {
    if (!req.body.query) return res.status(400).json({ error: 'query is required' });
    if (req.body.query.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({ error: `Query too long. Maximum ${MAX_QUERY_LENGTH} characters.` });
    }
    if (req.body.limit) {
      req.body.limit = Math.min(req.body.limit, MAX_SEARCH_LIMIT);
    }
    const results = await searchThoughts(req.body);
    res.json(results);
  } catch (err: any) {
    console.error('searchThoughts error:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

app.post('/capture', async (req, res) => {
  try {
    if (!req.body.text) return res.status(400).json({ error: 'text is required' });
    if (req.body.text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `Text too long. Maximum ${MAX_TEXT_LENGTH} characters.` });
    }
    if (req.body.source && !VALID_SOURCES.includes(req.body.source)) {
      return res.status(400).json({ error: `Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}` });
    }
    const result = await captureThought(req.body);
    res.json(result);
  } catch (err: any) {
    console.error('captureThought error:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

app.get('/stats/timeseries', async (req, res) => {
  try {
    const startDate = req.query.startDate as string;
    if (startDate && !DATE_REGEX.test(startDate)) {
      return res.status(400).json({ error: 'Invalid startDate format. Use YYYY-MM-DD.' });
    }
    const endDate = req.query.endDate as string;
    if (endDate && !DATE_REGEX.test(endDate)) {
      return res.status(400).json({ error: 'Invalid endDate format. Use YYYY-MM-DD.' });
    }
    const interval = req.query.interval as string;
    if (interval && interval !== 'day' && interval !== 'week') {
      return res.status(400).json({ error: 'Invalid interval. Must be "day" or "week".' });
    }
    const results = await getTimeSeries({
      startDate,
      endDate,
      interval: interval as 'day' | 'week',
    });
    res.json(results);
  } catch (err: any) {
    console.error('getTimeSeries error:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

app.post('/reports/generate', async (req, res) => {
  try {
    if (!req.body.startDate || !req.body.endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    if (!DATE_REGEX.test(req.body.startDate)) {
      return res.status(400).json({ error: 'Invalid startDate format. Use YYYY-MM-DD.' });
    }
    if (!DATE_REGEX.test(req.body.endDate)) {
      return res.status(400).json({ error: 'Invalid endDate format. Use YYYY-MM-DD.' });
    }
    const narrative = await generateNarrative(req.body);
    res.json({ narrative });
  } catch (err: any) {
    console.error('generateNarrative error:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

export { app };
