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
  const [recent, setRecent] = useState<ThoughtRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getTimeSeries({ startDate: timeRange.startDate, endDate: timeRange.endDate }),
      api.listThoughts({ pageSize: '10' }),
    ])
      .then(([statsData, recentData]) => {
        setStats(statsData);
        setRecent(recentData.items);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [timeRange]);

  return (
    <ContentLayout
      header={
        <Header variant="h1" actions={<TimeRangeSelector onChange={setTimeRange} defaultRange={savedTimeRange.key} />}>
          Dashboard
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
                  total={stats.buckets
                    .filter((b) => b.date >= timeRange.startDate && b.date <= timeRange.endDate)
                    .reduce((sum, b) => sum + b.total, 0)}
                  projects={stats.projects}
                />
                <TimelineChart stats={stats} startDate={timeRange.startDate} endDate={timeRange.endDate} />
              </>
            )}
            <hr style={{ border: 'none', borderTop: '1px solid currentColor', opacity: 0.15, margin: 0 }} />
            <RecentThoughts thoughts={recent} />
          </>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
