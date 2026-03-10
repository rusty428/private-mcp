import { useState, useEffect } from 'react';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import { format, subDays } from 'date-fns';
import { api } from '../../api/client';
import type { TimeSeriesResponse, ThoughtRecord } from '../../api/types';
import { TimeRangeSelector } from '../../components/TimeRangeSelector';
import { StatCards } from './StatCards';
import { ActivityChart } from './ActivityChart';
import { TypeBreakdown } from './TypeBreakdown';
import { TopTopics } from './TopTopics';
import { SourceBreakdown } from './SourceBreakdown';
import { RecentThoughts } from './RecentThoughts';

export function Dashboard() {
  const [timeRange, setTimeRange] = useState({
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
  });
  const [stats, setStats] = useState<TimeSeriesResponse | null>(null);
  const [recent, setRecent] = useState<ThoughtRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getTimeSeries({ startDate: timeRange.startDate, endDate: timeRange.endDate }),
      api.listThoughts({ limit: '10' }),
    ])
      .then(([statsData, recentData]) => {
        setStats(statsData);
        setRecent(recentData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [timeRange]);

  const sources = stats ? Object.keys(stats.bySource) : [];

  return (
    <SpaceBetween size="l">
      <Header variant="h1" actions={<TimeRangeSelector onChange={setTimeRange} />}>
        Thought Dashboard
      </Header>

      {stats && (
        <>
          <StatCards
            total={stats.totalAllTime}
            periodCount={stats.totalInRange}
            actionItems={stats.actionItemCount}
            projectCount={stats.projects.length}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <ActivityChart buckets={stats.buckets} sources={sources} />
            <TypeBreakdown byType={stats.byType} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <TopTopics topTopics={stats.topTopics} />
            <SourceBreakdown bySource={stats.bySource} />
          </div>
        </>
      )}

      <RecentThoughts thoughts={recent} />
    </SpaceBetween>
  );
}
