import { S3VectorsClient, QueryVectorsCommand } from '@aws-sdk/client-s3vectors';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { EMBEDDING_MODEL_ID, VECTOR_DIMENSIONS } from '../../../types/config';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });
const bedrock = new BedrockRuntimeClient({ region: process.env.REGION });

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) || 0) + 1);
}

function sortedEntries(map: Map<string, number>): { name: string; count: number }[] {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export async function exploreTopic(topic: string, teamId: string, since?: string) {
  const filterConditions: any[] = [
    { topics: { '$in': [topic.toLowerCase()] } },
    { team_id: { '$eq': teamId } },
    { '$or': [
      { quality: { '$ne': 'noise' } },
      { quality: { '$exists': false } },
    ]},
  ];

  const filter = { '$and': filterConditions };

  // QueryVectors requires a vector — embed the topic name as the query
  const embedResponse = await bedrock.send(new InvokeModelCommand({
    modelId: EMBEDDING_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({ inputText: topic, dimensions: VECTOR_DIMENSIONS, normalize: true }),
  }));
  const queryVector = JSON.parse(new TextDecoder().decode(embedResponse.body)).embedding;

  const searchResponse = await s3vectors.send(new QueryVectorsCommand({
    vectorBucketName: process.env.VECTOR_BUCKET_NAME,
    indexName: process.env.VECTOR_INDEX_NAME,
    queryVector: { float32: queryVector },
    topK: 100,
    returnMetadata: true,
    filter,
  }));

  let results = searchResponse.vectors || [];

  if (since) {
    results = results.filter((r: any) => {
      const td = r.metadata?.thought_date || r.metadata?.created_at?.slice(0, 10) || '';
      return td >= since;
    });
  }

  const projects = new Map<string, number>();
  const people = new Map<string, number>();
  const coTopics = new Map<string, number>();

  for (const r of results) {
    const meta = r.metadata as any || {};
    if (meta.project) increment(projects, meta.project);
    for (const p of meta.people || []) increment(people, p);
    for (const t of meta.topics || []) {
      if (t !== topic.toLowerCase()) increment(coTopics, t);
    }
  }

  return {
    topic,
    total_mentions: results.length,
    projects: sortedEntries(projects),
    people: sortedEntries(people),
    related_topics: sortedEntries(coTopics).slice(0, 10),
    recent: results.slice(0, 5).map((r: any) => ({
      thought_date: r.metadata?.thought_date,
      summary: r.metadata?.summary || r.metadata?.content?.slice(0, 200),
      project: r.metadata?.project,
    })),
  };
}
