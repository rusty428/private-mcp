export type ThoughtType = 'observation' | 'task' | 'idea' | 'reference' | 'person_note';

export interface ThoughtMetadata {
  content: string;
  type: ThoughtType;
  topics: string[];
  people: string[];
  action_items: string[];
  dates_mentioned: string[];
  source: 'slack' | 'mcp' | 'api';
  source_ref?: string;
  created_at: string;
}

export interface ProcessThoughtInput {
  text: string;
  source: 'slack' | 'mcp' | 'api';
  sourceRef?: string;
}

export interface ProcessThoughtResult {
  id: string;
  type: ThoughtType;
  topics: string[];
  people: string[];
  action_items: string[];
  created_at: string;
}

export interface ThoughtSearchResult {
  key: string;
  distance: number;
  metadata: ThoughtMetadata;
}
