import { useState } from 'react';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import Box from '@cloudscape-design/components/box';
import SpaceBetween from '@cloudscape-design/components/space-between';
import SegmentedControl from '@cloudscape-design/components/segmented-control';
import MixedLineBarChart from '@cloudscape-design/components/mixed-line-bar-chart';
import type { TimeSeriesResponse } from '../../api/types';
import { format, eachDayOfInterval } from 'date-fns';
import { parseLocalDate } from '../../utils/parseDate';

const CHART_TYPE_KEY = 'dashboard-chart-type';
const CHART_MODE_KEY = 'dashboard-chart-mode';
type ChartType = 'line' | 'bar';
type ChartMode = 'types' | 'sources' | 'topics';

function getSavedChartType(): ChartType {
  const saved = localStorage.getItem(CHART_TYPE_KEY);
  return saved === 'bar' ? 'bar' : 'line';
}

function getSavedChartMode(): ChartMode {
  const saved = localStorage.getItem(CHART_MODE_KEY);
  return saved === 'sources' ? 'sources' : saved === 'topics' ? 'topics' : 'types';
}

interface TimelineChartProps {
  stats: TimeSeriesResponse;
  startDate: string;
  endDate: string;
}

export function TimelineChart({ stats, startDate, endDate }: TimelineChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>(getSavedChartMode);
  const [chartType, setChartType] = useState<ChartType>(getSavedChartType);

  const filteredBuckets = stats.buckets.filter((b) => b.date >= startDate && b.date <= endDate);

  if (filteredBuckets.length === 0) return null;

  return (
    <Container
      header={
        <Header
          variant="h2"
          actions={
            <SpaceBetween direction="horizontal" size="m">
              <SegmentedControl
                selectedId={chartType}
                onChange={({ detail }) => {
                  const val = detail.selectedId as ChartType;
                  setChartType(val);
                  localStorage.setItem(CHART_TYPE_KEY, val);
                }}
                options={[
                  { id: 'line', text: 'Line' },
                  { id: 'bar', text: 'Bar' },
                ]}
              />
              <SegmentedControl
                selectedId={chartMode}
                onChange={({ detail }) => {
                  const val = detail.selectedId as ChartMode;
                  setChartMode(val);
                  localStorage.setItem(CHART_MODE_KEY, val);
                }}
                options={[
                  { id: 'types', text: 'By Type' },
                  { id: 'sources', text: 'By Source' },
                  { id: 'topics', text: 'By Topic' },
                ]}
              />
            </SpaceBetween>
          }
        >
          Activity Over Time
        </Header>
      }
    >
      <MixedLineBarChart
        height={300}
        xScaleType="categorical"
        stackedBars={chartType === 'bar'}
        hideFilter
        series={(() => {
          const dateKeys = eachDayOfInterval({
            start: parseLocalDate(startDate),
            end: parseLocalDate(endDate),
          }).map((d) => format(d, 'M/d'));
          const byDateGroup: Record<string, Record<string, number>> = {};
          const allGroups = new Set<string>();

          const bucketField = chartMode === 'types' ? 'byType' : chartMode === 'sources' ? 'bySource' : 'byTopic';
          const topTopics = chartMode === 'topics' ? new Set(stats.topTopics.slice(0, 10).map((t) => t.topic)) : null;

          filteredBuckets.forEach((bucket) => {
            const dateKey = format(parseLocalDate(bucket.date), 'M/d');
            const breakdown = bucket[bucketField];
            for (const [group, count] of Object.entries(breakdown)) {
              if (topTopics && !topTopics.has(group)) continue;
              allGroups.add(group);
              if (!byDateGroup[dateKey]) byDateGroup[dateKey] = {};
              byDateGroup[dateKey][group] = (byDateGroup[dateKey][group] || 0) + count;
            }
          });

          return Array.from(allGroups).sort().map((group) => ({
            title: group,
            type: chartType as 'line' | 'bar',
            data: dateKeys.map((dateKey) => ({
              x: dateKey,
              y: byDateGroup[dateKey]?.[group] || 0,
            })),
          }));
        })()}
        xTitle="Date"
        yTitle="Thoughts"
        empty={
          <Box textAlign="center" color="inherit">
            <b>No data</b>
          </Box>
        }
      />
    </Container>
  );
}
