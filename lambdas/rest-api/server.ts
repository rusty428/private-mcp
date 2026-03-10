import express, { Express } from 'express';
import { listThoughts } from './functions/listThoughts';
import { getThought } from './functions/getThought';
import { editThought } from './functions/editThought';
import { deleteThought } from './functions/deleteThought';
import { searchThoughts } from './functions/searchThoughts';
import { captureThought } from './functions/captureThought';

const app: Express = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/thoughts', async (req, res) => {
  try {
    const results = await listThoughts({
      type: req.query.type as string,
      source: req.query.source as string,
      project: req.query.project as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/thoughts/:id', async (req, res) => {
  try {
    const result = await getThought(req.params.id);
    if (!result) return res.status(404).json({ error: 'Thought not found' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/thoughts/:id', async (req, res) => {
  try {
    const result = await editThought(req.params.id, req.body);
    if (result.error === 'not_found') return res.status(404).json({ error: 'Thought not found' });
    if (result.error === 'pending') return res.status(409).json({ error: 'Cannot edit a thought that is still being processed' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/thoughts/:id', async (req, res) => {
  try {
    const result = await deleteThought(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/search', async (req, res) => {
  try {
    if (!req.body.query) return res.status(400).json({ error: 'query is required' });
    const results = await searchThoughts(req.body);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/capture', async (req, res) => {
  try {
    if (!req.body.text) return res.status(400).json({ error: 'text is required' });
    const result = await captureThought(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { app };
