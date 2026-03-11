import type { ThoughtRecord, SearchResult, TimeSeriesResponse, CaptureResult, NarrativeResponse } from './types';

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
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<ThoughtRecord[]>(`/thoughts${query}`);
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

  search: async (params: { query: string; limit?: number; threshold?: number; project?: string }) => {
    console.log('API search called with:', params);
    const results = await request<SearchResult[]>('/search', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    console.log('API search raw results:', results);
    return results;
  },

  capture: (params: { text: string; source?: string; project?: string }) =>
    request<CaptureResult>('/capture', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  getTimeSeries: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<TimeSeriesResponse>(`/stats/timeseries${query}`);
  },

  generateNarrative: (params: { startDate: string; endDate: string; project?: string }) =>
    request<NarrativeResponse>('/reports/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
};
