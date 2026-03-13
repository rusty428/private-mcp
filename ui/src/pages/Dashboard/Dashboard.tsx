import { useState, useEffect } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Grid from '@cloudscape-design/components/grid';
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
    <ContentLayout
      header={
        <Header variant="h1" actions={<TimeRangeSelector onChange={setTimeRange} />}>
          Thought Dashboard
        </Header>
      }
    >
    <SpaceBetween size="l">
      {stats && (
        <>
          <StatCards
            total={stats.totalAllTime}
            periodCount={stats.totalInRange}
            actionItems={stats.actionItemCount}
            projectCount={stats.projects.length}
          />
          <Grid gridDefinition={[{ colspan: { default: 12, m: 6 } }, { colspan: { default: 12, m: 6 } }]}>
            <ActivityChart buckets={stats.buckets} sources={sources} />
            <TypeBreakdown byType={stats.byType} />
          </Grid>
          <Grid gridDefinition={[{ colspan: { default: 12, m: 6 } }, { colspan: { default: 12, m: 6 } }]}>
            <TopTopics topTopics={stats.topTopics} />
            <SourceBreakdown bySource={stats.bySource} />
          </Grid>
        </>
      )}

      <RecentThoughts thoughts={recent} />
    </SpaceBetween>
    </ContentLayout>
  );
}
