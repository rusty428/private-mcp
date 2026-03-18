export type { ThoughtMetadata, ThoughtType, ThoughtSource, ThoughtQuality } from '@shared-types/thought';

export interface ThoughtRecord {
  key: string;
  metadata: import('@shared-types/thought').ThoughtMetadata;
}

export interface SearchResult {
  key: string;
  distance: number;
  metadata: import('@shared-types/thought').ThoughtMetadata;
}

export interface TimeSeriesResponse {
  buckets: Array<{
    date: string;
    total: number;
    bySource: Record<string, number>;
    byType: Record<string, number>;
    byTopic: Record<string, number>;
    byProject: Record<string, number>;
  }>;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  topTopics: Array<{ topic: string; count: number }>;
  projects: Array<{ project: string; count: number }>;
  actionItemCount: number;
  totalInRange: number;
  totalAllTime: number;
}

export interface PaginatedThoughtsResponse {
  items: ThoughtRecord[];
  hasMore: boolean;
  nextToken?: string;
  totalCount?: number;
}

export interface CaptureResult {
  id: string;
  quality: string;
  thought_date: string;
  created_at: string;
}

export interface NarrativeResponse {
  narrative: string;
}
