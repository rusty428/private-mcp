export type ThoughtType =
  | 'observation'
  | 'task'
  | 'idea'
  | 'reference'
  | 'person_note'
  | 'decision'
  | 'project_summary'
  | 'milestone';

export type ThoughtSource = string;

export type ThoughtQuality = 'high' | 'standard' | 'noise';

export const VALID_THOUGHT_TYPES: ThoughtType[] = [
  'observation', 'task', 'idea', 'reference', 'person_note',
  'decision', 'project_summary', 'milestone',
];

export interface ThoughtMetadata {
  content: string;
  summary: string;
  type: ThoughtType | 'pending';
  topics: string[];
  people: string[];
  action_items: string[];
  dates_mentioned: string[];
  project: string;
  related_projects: string[];
  source: ThoughtSource;
  source_ref: string;
  session_id: string;
  session_name: string;
  quality: ThoughtQuality;
  thought_date: string;
  created_at: string;
}

export interface ProcessThoughtInput {
  text: string;
  source: ThoughtSource;
  sourceRef?: string;
  project?: string;
  session_id?: string;
  session_name?: string;
}

export interface ProcessThoughtResult {
  id: string;
  quality: ThoughtQuality;
  thought_date: string;
  created_at: string;
}

export interface EnrichThoughtInput {
  id: string;
  content: string;
  source: ThoughtSource;
  project: string;
  session_id: string;
  session_name: string;
  source_ref: string;
  thought_date: string;
  created_at: string;
}

export interface ThoughtSearchResult {
  key: string;
  distance: number;
  metadata: ThoughtMetadata;
}
