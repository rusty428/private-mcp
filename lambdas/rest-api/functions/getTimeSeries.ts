import { queryThoughts } from '../utils/queryThoughts';
import { queryByProject } from '../utils/queryByProject';

interface TimeSeriesParams {
  startDate?: string;
  endDate?: string;
  interval?: 'day' | 'week';
  project?: string;
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

export async function getTimeSeries(params: TimeSeriesParams) {
  const { startDate, endDate, interval = 'day', project } = params;

  // Fetch records — use project GSI if project specified, otherwise month GSI
  let allItems: Array<{ key: string; metadata: Record<string, any> }>;
  if (project) {
    allItems = await queryByProject({ project, startDate, endDate });
  } else {
    // Fetch up to maxRecords using the month GSI
    const result = await queryThoughts({
      startDate,
      endDate,
      maxRecords: 5000,
      pageSize: 5000,
    });
    allItems = result.items;
  }

  if (allItems.length === 0) {
    return { buckets: [], byType: {}, bySource: {}, topTopics: [], projects: [], actionItemCount: 0, totalInRange: 0, totalAllTime: 0 };
  }

  const filtered = allItems.map((v) => v.metadata);

  const bucketMap: Record<string, { total: number; bySource: Record<string, number>; byType: Record<string, number>; byTopic: Record<string, number>; byProject: Record<string, number> }> = {};
  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const topicCounts: Record<string, number> = {};
  const projectCounts: Record<string, number> = {};
  let actionItemCount = 0;

  for (const m of filtered) {
    const dateStr = m.thought_date || m.created_at?.slice(0, 10) || '';
    const bucketKey = interval === 'week' ? getWeekStart(dateStr) : dateStr;
    if (!bucketMap[bucketKey]) bucketMap[bucketKey] = { total: 0, bySource: {}, byType: {}, byTopic: {}, byProject: {} };
    bucketMap[bucketKey].total++;
    const src = m.source || 'unknown';
    bucketMap[bucketKey].bySource[src] = (bucketMap[bucketKey].bySource[src] || 0) + 1;
    const type = m.type || 'unknown';
    bucketMap[bucketKey].byType[type] = (bucketMap[bucketKey].byType[type] || 0) + 1;
    byType[type] = (byType[type] || 0) + 1;
    bySource[src] = (bySource[src] || 0) + 1;
    if (Array.isArray(m.topics)) {
      for (const t of m.topics) {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
        bucketMap[bucketKey].byTopic[t] = (bucketMap[bucketKey].byTopic[t] || 0) + 1;
      }
    }
    if (m.project) {
      projectCounts[m.project] = (projectCounts[m.project] || 0) + 1;
      bucketMap[bucketKey].byProject[m.project] = (bucketMap[bucketKey].byProject[m.project] || 0) + 1;
    }
    if (Array.isArray(m.action_items)) actionItemCount += m.action_items.length;
  }

  const buckets = Object.entries(bucketMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, data]) => ({ date, ...data }));
  const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([topic, count]) => ({ topic, count }));
  const projects = Object.entries(projectCounts).sort((a, b) => b[1] - a[1]).map(([project, count]) => ({ project, count }));

  return { buckets, byType, bySource, topTopics, projects, actionItemCount, totalInRange: filtered.length, totalAllTime: filtered.length };
}
