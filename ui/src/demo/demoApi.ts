import rawThoughts from './demo-thoughts.json';
import rawTimeSeries from './demo-timeseries.json';
import rawSettings from './demo-settings.json';
import { shiftThoughtDates, shiftTimeSeriesDates } from './shiftDates';
import type { ThoughtRecord, TimeSeriesResponse, PaginatedThoughtsResponse, SearchResult } from '../api/types';
import type { EnrichmentSettings } from '../api/settingsTypes';

const thoughts: ThoughtRecord[] = (rawThoughts as any[]).map(shiftThoughtDates);
const timeSeries: TimeSeriesResponse = shiftTimeSeriesDates(rawTimeSeries as any);
const settings: EnrichmentSettings = rawSettings as any;

export const demoApi = {
  getTimeSeries(params?: Record<string, string>): TimeSeriesResponse {
    if (params?.project) {
      return {
        ...timeSeries,
        buckets: timeSeries.buckets.map((b) => ({
          ...b,
          total: b.byProject[params.project!] || 0,
          byProject: params.project! in b.byProject ? { [params.project!]: b.byProject[params.project!] } : {},
        })),
      };
    }
    return timeSeries;
  },

  listThoughts(params?: Record<string, string>): PaginatedThoughtsResponse {
    let filtered = [...thoughts];
    if (params?.type) filtered = filtered.filter((t) => t.metadata.type === params.type);
    if (params?.project) filtered = filtered.filter((t) => t.metadata.project === params.project);

    const pageSize = parseInt(params?.pageSize || '25', 10);
    const startIndex = params?.nextToken ? parseInt(params.nextToken, 10) : 0;
    const page = filtered.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < filtered.length;

    return {
      items: page,
      hasMore,
      nextToken: hasMore ? String(startIndex + pageSize) : undefined,
    };
  },

  getEnrichmentSettings(): EnrichmentSettings {
    return settings;
  },

  getProjects(): { projects: string[] } {
    return { projects: Object.keys(settings.projects).sort() };
  },

  search(): SearchResult[] {
    return [];
  },
};
