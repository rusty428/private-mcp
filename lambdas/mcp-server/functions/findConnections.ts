import { queryProjectThoughts, ProjectThought } from './queryProjectThoughts';
import { loadSettings } from './loadSettings';
import { resolveProjectAlias } from './resolveProjectAlias';

interface EntityCount {
  name: string;
  count_a: number;
  count_b: number;
}

interface ProjectStats {
  thoughts: number;
  unique_topics: number;
  unique_people: number;
}

interface FindConnectionsResult {
  shared_topics: EntityCount[];
  shared_people: EntityCount[];
  project_a: ProjectStats;
  project_b: ProjectStats;
}

function aggregateField(thoughts: ProjectThought[], field: 'topics' | 'people'): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of thoughts) {
    for (const value of t[field]) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return counts;
}

function intersect(mapA: Map<string, number>, mapB: Map<string, number>, minOccurrences: number): EntityCount[] {
  const shared: EntityCount[] = [];
  for (const [name, countA] of mapA) {
    const countB = mapB.get(name);
    if (countB !== undefined && countA >= minOccurrences && countB >= minOccurrences) {
      shared.push({ name, count_a: countA, count_b: countB });
    }
  }
  shared.sort((a, b) => (b.count_a + b.count_b) - (a.count_a + a.count_b));
  return shared;
}

export async function findConnections(
  projectA: string,
  projectB: string,
  teamId: string,
  minOccurrences: number = 1,
): Promise<FindConnectionsResult> {
  const settings = await loadSettings();
  const resolvedA = resolveProjectAlias(projectA, settings);
  const resolvedB = resolveProjectAlias(projectB, settings);

  const [thoughtsA, thoughtsB] = await Promise.all([
    queryProjectThoughts(resolvedA, teamId),
    queryProjectThoughts(resolvedB, teamId),
  ]);

  const topicsA = aggregateField(thoughtsA, 'topics');
  const topicsB = aggregateField(thoughtsB, 'topics');
  const peopleA = aggregateField(thoughtsA, 'people');
  const peopleB = aggregateField(thoughtsB, 'people');

  return {
    shared_topics: intersect(topicsA, topicsB, minOccurrences),
    shared_people: intersect(peopleA, peopleB, minOccurrences),
    project_a: { thoughts: thoughtsA.length, unique_topics: topicsA.size, unique_people: peopleA.size },
    project_b: { thoughts: thoughtsB.length, unique_topics: topicsB.size, unique_people: peopleB.size },
  };
}
