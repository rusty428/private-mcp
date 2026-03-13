import { useState } from 'react';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import Box from '@cloudscape-design/components/box';
import SpaceBetween from '@cloudscape-design/components/space-between';
import SegmentedControl from '@cloudscape-design/components/segmented-control';
import MixedLineBarChart from '@cloudscape-design/components/mixed-line-bar-chart';
import type { ThoughtRecord, TimeSeriesResponse } from '../../api/types';
import { format, parseISO } from 'date-fns';
import { parseLocalDate } from '../../utils/parseDate';

const CHART_TYPE_KEY = 'dashboard-chart-type';
type ChartType = 'line' | 'bar';

function getSavedChartType(): ChartType {
  const saved = localStorage.getItem(CHART_TYPE_KEY);
  return saved === 'bar' ? 'bar' : 'line';
}

interface TimelineChartProps {
  stats: TimeSeriesResponse;
  thoughts: ThoughtRecord[];
}

function safeDate(thought: ThoughtRecord): Date {
  const raw = thought.metadata.thought_date || thought.metadata.created_at || '';
  const d = parseLocalDate(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function TimelineChart({ stats, thoughts }: TimelineChartProps) {
  const [chartMode, setChartMode] = useState<string>('types');
  const [chartType, setChartType] = useState<ChartType>(getSavedChartType);

  if (thoughts.length === 0) return null;

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
                onChange={({ detail }) => setChartMode(detail.selectedId)}
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
          const dateKeys = stats.buckets.map((b) => format(parseISO(b.date), 'M/d'));
          const byDateGroup: Record<string, Record<string, number>> = {};
          const allGroups = new Set<string>();

          if (chartMode === 'types') {
            thoughts.forEach((t) => {
              const dateKey = format(safeDate(t), 'M/d');
              const group = t.metadata.type || 'pending';
              allGroups.add(group);
              if (!byDateGroup[dateKey]) byDateGroup[dateKey] = {};
              byDateGroup[dateKey][group] = (byDateGroup[dateKey][group] || 0) + 1;
            });
          } else if (chartMode === 'sources') {
            stats.buckets.forEach((b) => {
              const dateKey = format(parseISO(b.date), 'M/d');
              Object.entries(b.bySource).forEach(([source, count]) => {
                allGroups.add(source);
                if (!byDateGroup[dateKey]) byDateGroup[dateKey] = {};
                byDateGroup[dateKey][source] = (byDateGroup[dateKey][source] || 0) + count;
              });
            });
          } else {
            const topTopics = stats.topTopics.slice(0, 10).map((t) => t.topic);
            thoughts.forEach((t) => {
              const dateKey = format(safeDate(t), 'M/d');
              (t.metadata.topics || []).forEach((topic) => {
                if (topTopics.includes(topic)) {
                  allGroups.add(topic);
                  if (!byDateGroup[dateKey]) byDateGroup[dateKey] = {};
                  byDateGroup[dateKey][topic] = (byDateGroup[dateKey][topic] || 0) + 1;
                }
              });
            });
          }

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
