import { useState, useEffect } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import Box from '@cloudscape-design/components/box';
import Spinner from '@cloudscape-design/components/spinner';
import { api } from '../../api/client';
import type { TimeSeriesResponse, ThoughtRecord } from '../../api/types';
import { TimeRangeSelector, getSavedTimeRange } from '../../components/TimeRangeSelector';
import { StatCards } from './StatCards';
import { TimelineChart } from './TimelineChart';
import { RecentThoughts } from './RecentThoughts';

const savedTimeRange = getSavedTimeRange();

export function Dashboard() {
  const [timeRange, setTimeRange] = useState(savedTimeRange.range);
  const [stats, setStats] = useState<TimeSeriesResponse | null>(null);
  const [thoughts, setThoughts] = useState<ThoughtRecord[]>([]);
  const [recent, setRecent] = useState<ThoughtRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getTimeSeries({ startDate: timeRange.startDate, endDate: timeRange.endDate }),
      api.listThoughts({ startDate: timeRange.startDate, endDate: timeRange.endDate, limit: '1000' }),
      api.listThoughts({ limit: '10' }),
    ])
      .then(([statsData, thoughtsData, recentData]) => {
        setStats(statsData);
        setThoughts(thoughtsData);
        setRecent(recentData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [timeRange]);

  return (
    <ContentLayout
      header={
        <Header variant="h1" actions={<TimeRangeSelector onChange={setTimeRange} defaultRange={savedTimeRange.key} />}>
          Thought Dashboard
        </Header>
      }
    >
      <SpaceBetween size="l">
        {loading ? (
          <Box textAlign="center" padding={{ top: 'xxl' }}>
            <Spinner size="large" />
          </Box>
        ) : (
          <>
            {stats && (
              <>
                <StatCards
                  total={stats.totalAllTime}
                  periodCount={stats.totalInRange}
                  actionItems={stats.actionItemCount}
                  projectCount={stats.projects.length}
                />
                <TimelineChart stats={stats} thoughts={thoughts} />
              </>
            )}
            <RecentThoughts thoughts={recent} />
          </>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
