import type { ThoughtRecord, PaginatedThoughtsResponse, SearchResult, TimeSeriesResponse, CaptureResult, NarrativeResponse } from './types';
import type { EnrichmentSettings } from './settingsTypes';
import { demoApi } from '../demo/demoApi';

let _demoMode = false;
export function setDemoMode(flag: boolean) { _demoMode = flag; }

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT;
const API_KEY = import.meta.env.VITE_API_KEY;
const STAGE = 'api';

if (!API_ENDPOINT || !API_KEY) {
  throw new Error('Missing VITE_API_ENDPOINT or VITE_API_KEY in .env.local — copy .env.example to .env.local and fill in values');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_ENDPOINT}/${STAGE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

export const api = {
  listThoughts: (params?: Record<string, string>) => {
    if (_demoMode) return Promise.resolve(demoApi.listThoughts(params));
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<PaginatedThoughtsResponse>(`/thoughts${query}`);
  },

  getProjects: () => {
    if (_demoMode) return Promise.resolve(demoApi.getProjects());
    return request<{ projects: string[] }>('/projects');
  },

  getThought: (id: string) =>
    request<ThoughtRecord>(`/thoughts/${id}`),

  editThought: (id: string, updates: Record<string, any>) =>
    request<{ success: boolean; metadata: any }>(`/thoughts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  deleteThought: (id: string) =>
    request<{ success: boolean }>(`/thoughts/${id}`, { method: 'DELETE' }),

  search: (params: { query: string; limit?: number; threshold?: number; project?: string }) => {
    if (_demoMode) return Promise.resolve(demoApi.search());
    return request<SearchResult[]>('/search', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  capture: (params: { text: string; source?: string; project?: string }) =>
    request<CaptureResult>('/capture', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  getTimeSeries: (params?: Record<string, string>) => {
    if (_demoMode) return Promise.resolve(demoApi.getTimeSeries(params));
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<TimeSeriesResponse>(`/stats/timeseries${query}`);
  },

  generateNarrative: (params: { startDate: string; endDate: string; project?: string }) =>
    request<NarrativeResponse>('/reports/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  getEnrichmentSettings: () => {
    if (_demoMode) return Promise.resolve(demoApi.getEnrichmentSettings());
    return request<EnrichmentSettings>('/settings/enrichment');
  },

  putEnrichmentSettings: (settings: Omit<EnrichmentSettings, 'updatedAt' | 'generatedPrompt'>) =>
    request<EnrichmentSettings>('/settings/enrichment', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};
