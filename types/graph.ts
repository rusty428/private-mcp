// types/graph.ts

export type EntityType = 'person' | 'project' | 'topic';

export const VALID_ENTITY_TYPES: EntityType[] = ['person', 'project', 'topic'];

export const DEFAULT_PREDICATES = [
  'works_on',
  'decided',
  'blocked_by',
  'owns',
  'assigned_to',
  'related_to',
] as const;

export interface RawTriple {
  subject: string;
  predicate: string;
  object: string;
  subject_type: EntityType;
  object_type: EntityType;
  confidence: number;
}

export interface GraphEntity {
  pk: string;
  sk: 'META';
  name: string;
  entity_type: EntityType;
  team_id: string;
  created_at: string;
  updated_at: string;
  source_thought_id: string;
}

export interface GraphTriple {
  pk: string;
  sk: string;
  subject: string;
  predicate: string;
  object: string;
  inversePk: string;
  inverseSk: string;
  team_id: string;
  confidence: number;
  valid_from: string;
  valid_to?: string;
  source_thought_id: string;
  created_at: string;
}
