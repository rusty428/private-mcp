import { listAllVectors } from '../utils/listAllVectors';

interface ListThoughtsParams {
  type?: string;
  source?: string;
  project?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export async function listThoughts(params: ListThoughtsParams) {
  const { type, source, project, startDate, endDate, limit = 50 } = params;
  const allVectors = await listAllVectors();
  let results = allVectors.filter((r) => r.metadata?.quality !== 'noise');
  if (type) results = results.filter((r) => r.metadata?.type === type);
  if (source) results = results.filter((r) => r.metadata?.source === source);
  if (project) results = results.filter((r) => r.metadata?.project === project);
  if (startDate) {
    results = results.filter((r) => {
      const d = r.metadata?.thought_date || r.metadata?.created_at?.slice(0, 10) || '';
      return d >= startDate;
    });
  }
  if (endDate) {
    results = results.filter((r) => {
      const d = r.metadata?.thought_date || r.metadata?.created_at?.slice(0, 10) || '';
      return d <= endDate;
    });
  }
  results.sort((a, b) => (b.metadata?.created_at || '').localeCompare(a.metadata?.created_at || ''));
  return results.slice(0, limit);
}
