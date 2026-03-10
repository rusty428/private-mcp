import { listAllVectors } from '../utils/listAllVectors';

interface TimeSeriesParams {
  startDate?: string;
  endDate?: string;
  interval?: 'day' | 'week';
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export async function getTimeSeries(params: TimeSeriesParams) {
  const { startDate, endDate, interval = 'day' } = params;
  const allVectors = await listAllVectors();

  if (allVectors.length === 0) {
    return { buckets: [], byType: {}, bySource: {}, topTopics: [], projects: [], actionItemCount: 0, totalInRange: 0, totalAllTime: 0 };
  }

  const allNonNoise = allVectors.map((v) => v.metadata).filter((m: any) => m && m.quality !== 'noise');
  const totalAllTime = allNonNoise.length;

  let filtered = [...allNonNoise];
  if (startDate) filtered = filtered.filter((m: any) => { const d = m.thought_date || m.created_at?.slice(0, 10) || ''; return d >= startDate; });
  if (endDate) filtered = filtered.filter((m: any) => { const d = m.thought_date || m.created_at?.slice(0, 10) || ''; return d <= endDate; });

  const bucketMap: Record<string, { total: number; bySource: Record<string, number> }> = {};
  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const topicCounts: Record<string, number> = {};
  const projectCounts: Record<string, number> = {};
  let actionItemCount = 0;

  for (const m of filtered) {
    const dateStr = m.thought_date || m.created_at?.slice(0, 10) || '';
    const bucketKey = interval === 'week' ? getWeekStart(dateStr) : dateStr;
    if (!bucketMap[bucketKey]) bucketMap[bucketKey] = { total: 0, bySource: {} };
    bucketMap[bucketKey].total++;
    const src = m.source || 'unknown';
    bucketMap[bucketKey].bySource[src] = (bucketMap[bucketKey].bySource[src] || 0) + 1;
    const type = m.type || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
    bySource[src] = (bySource[src] || 0) + 1;
    if (Array.isArray(m.topics)) { for (const t of m.topics) topicCounts[t] = (topicCounts[t] || 0) + 1; }
    if (m.project) projectCounts[m.project] = (projectCounts[m.project] || 0) + 1;
    if (Array.isArray(m.action_items)) actionItemCount += m.action_items.length;
  }

  const buckets = Object.entries(bucketMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, data]) => ({ date, ...data }));
  const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([topic, count]) => ({ topic, count }));
  const projects = Object.entries(projectCounts).sort((a, b) => b[1] - a[1]).map(([project, count]) => ({ project, count }));

  return { buckets, byType, bySource, topTopics, projects, actionItemCount, totalInRange: filtered.length, totalAllTime };
}
