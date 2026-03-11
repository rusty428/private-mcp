import { S3VectorsClient, QueryVectorsCommand } from '@aws-sdk/client-s3vectors';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { EMBEDDING_MODEL_ID, VECTOR_DIMENSIONS } from '../../../types/config';
import { ThoughtSearchResult } from '../../../types/thought';
import { MAX_QUERY_LENGTH, MAX_SEARCH_LIMIT } from '../../../types/validation';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });
const bedrock = new BedrockRuntimeClient({ region: process.env.REGION });

function parseSince(since: string): { start: string; end?: string } | null {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return { start: since };
  }

  if (since === 'today') {
    return { start: today };
  }

  if (since === 'yesterday') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return { start: d.toISOString().slice(0, 10), end: today };
  }

  if (since === 'this week') {
    const d = new Date(now);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return { start: d.toISOString().slice(0, 10) };
  }

  if (since === 'last week') {
    const d = new Date(now);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff - 7);
    const start = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 7);
    const end = d.toISOString().slice(0, 10);
    return { start, end };
  }

  if (since === 'this month') {
    return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01` };
  }

  if (since === 'last month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const start = d.toISOString().slice(0, 10);
    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return { start, end };
  }

  const daysAgoMatch = since.match(/^(\d+)\s*days?\s*ago$/);
  if (daysAgoMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(daysAgoMatch[1]));
    return { start: d.toISOString().slice(0, 10) };
  }

  return null;
}

export async function searchThoughts(
  query: string,
  limit: number = 10,
  threshold: number = 0.5,
  project?: string,
  since?: string,
): Promise<ThoughtSearchResult[]> {
  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error(`Query too long. Maximum ${MAX_QUERY_LENGTH} characters, got ${query.length}.`);
  }
  limit = Math.min(limit, MAX_SEARCH_LIMIT);

  const embedResponse = await bedrock.send(new InvokeModelCommand({
    modelId: EMBEDDING_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      inputText: query,
      dimensions: VECTOR_DIMENSIONS,
      normalize: true,
    }),
  }));

  const embedResult = JSON.parse(new TextDecoder().decode(embedResponse.body));
  const queryVector = embedResult.embedding;

  // Exclude noise, but include old records that lack a quality field
  const noiseFilter = {
    '$or': [
      { quality: { '$ne': 'noise' } },
      { quality: { '$exists': false } },
    ],
  };

  const filterConditions: any[] = [noiseFilter];

  if (project) {
    filterConditions.push({
      '$or': [
        { project: { '$eq': project } },
        { project: { '$exists': false } },
      ],
    });
  }

  const filter = filterConditions.length === 1
    ? filterConditions[0]
    : { '$and': filterConditions };

  const searchResponse = await s3vectors.send(new QueryVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    queryVector: { float32: queryVector },
    topK: limit * 2,
    returnDistance: true,
    returnMetadata: true,
    filter,
  }));

  if (!searchResponse.vectors) return [];

  let results = searchResponse.vectors
    .filter((v: any) => v.distance !== undefined && v.distance <= threshold)
    .map((v: any) => ({
      key: v.key,
      distance: v.distance,
      metadata: v.metadata,
    }));

  if (since) {
    const dateRange = parseSince(since);
    if (!dateRange) {
      throw new Error('Unrecognized time filter. Use: today, yesterday, this week, last week, this month, last month, N days ago, or YYYY-MM-DD.');
    }
    results = results.filter((r: any) => {
      const td = r.metadata?.thought_date || r.metadata?.created_at?.slice(0, 10) || '';
      if (td < dateRange.start) return false;
      if (dateRange.end && td >= dateRange.end) return false;
      return true;
    });
  }

  return results.slice(0, limit);
}
