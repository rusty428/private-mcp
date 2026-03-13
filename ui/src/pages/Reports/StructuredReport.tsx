import { useState } from 'react';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Grid from '@cloudscape-design/components/grid';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Link from '@cloudscape-design/components/link';
import Modal from '@cloudscape-design/components/modal';
import Pagination from '@cloudscape-design/components/pagination';
import Table from '@cloudscape-design/components/table';
import MixedLineBarChart from '@cloudscape-design/components/mixed-line-bar-chart';
import SegmentedControl from '@cloudscape-design/components/segmented-control';
import { ThoughtTypeBadge } from '../../components/ThoughtTypeBadge';
import type { ThoughtRecord, TimeSeriesResponse } from '../../api/types';
import { format, parseISO } from 'date-fns';

const CHART_TYPE_KEY = 'dashboard-chart-type';
type ChartType = 'line' | 'bar';

function getSavedChartType(): ChartType {
  const saved = localStorage.getItem(CHART_TYPE_KEY);
  return saved === 'bar' ? 'bar' : 'line';
}

interface StructuredReportProps {
  thoughts: ThoughtRecord[];
  stats: TimeSeriesResponse;
}

function safeDate(thought: ThoughtRecord): Date {
  const raw = thought.metadata.thought_date || thought.metadata.created_at || '';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

const CARD_HEIGHT = 130;

const thoughtColumnDefinitions = [
  {
    id: 'type',
    header: 'Type',
    cell: (item: ThoughtRecord) => <ThoughtTypeBadge type={item.metadata.type} />,
    width: 140,
  },
  {
    id: 'summary',
    header: 'Summary',
    cell: (item: ThoughtRecord) => {
      const text = item.metadata.summary || item.metadata.content || '';
      return text.length > 100 ? text.substring(0, 100) + '...' : text;
    },
    maxWidth: 400,
  },
  {
    id: 'project',
    header: 'Project',
    cell: (item: ThoughtRecord) => item.metadata.project || '-',
    width: 150,
  },
  {
    id: 'date',
    header: 'Date',
    cell: (item: ThoughtRecord) => {
      const d = safeDate(item);
      return format(d, 'M/d/yyyy');
    },
    width: 120,
  },
];

function PaginatedThoughtTable({ items }: { items: ThoughtRecord[] }) {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;
  const pageCount = Math.ceil(items.length / pageSize);
  const paginatedItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <Table
      columnDefinitions={thoughtColumnDefinitions}
      items={paginatedItems}
      variant="embedded"
      pagination={
        pageCount > 1 ? (
          <Pagination
            currentPageIndex={currentPage}
            pagesCount={pageCount}
            onChange={({ detail }) => setCurrentPage(detail.currentPageIndex)}
          />
        ) : undefined
      }
      empty={
        <Box textAlign="center" color="inherit">
          <b>No thoughts</b>
        </Box>
      }
    />
  );
}

function OverflowCard({
  title,
  children,
  modalContent,
}: {
  title: string;
  children: React.ReactNode;
  modalContent: React.ReactNode;
}) {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
      <Container header={<Header variant="h3">{title}</Header>}>
        <div style={{ maxHeight: CARD_HEIGHT, overflow: 'hidden', position: 'relative' }}>
          {children}
        </div>
        <div style={{ textAlign: 'right', marginTop: '4px' }}>
          <Link onFollow={() => setModalVisible(true)}>...more</Link>
        </div>
      </Container>

      <Modal
        visible={modalVisible}
        onDismiss={() => setModalVisible(false)}
        header={title}
        size="medium"
        footer={
          <Box float="right">
            <Button variant="primary" onClick={() => setModalVisible(false)}>Close</Button>
          </Box>
        }
      >
        {modalContent}
      </Modal>
    </>
  );
}

function KpiValue({
  count,
  hasData,
  onClick,
}: {
  count: number | string;
  hasData: boolean;
  onClick: () => void;
}) {
  if (hasData) {
    return (
      <Link onFollow={onClick}>
        <Box variant="awsui-value-large" color="text-status-info">{count}</Box>
      </Link>
    );
  }
  return <Box variant="awsui-value-large">{count}</Box>;
}

export function StructuredReport({ thoughts, stats }: StructuredReportProps) {
  const [thoughtsModalVisible, setThoughtsModalVisible] = useState(false);
  const [projectsModalVisible, setProjectsModalVisible] = useState(false);
  const [actionItemsVisible, setActionItemsVisible] = useState(false);
  const [peopleModalVisible, setPeopleModalVisible] = useState(false);
  const [chartMode, setChartMode] = useState<string>('types');
  const [chartType, setChartType] = useState<ChartType>(getSavedChartType);

  // Get unique people mentioned
  const allPeople = new Set<string>();
  thoughts.forEach((t) => {
    t.metadata.people?.forEach((p) => allPeople.add(p));
  });
  const sortedPeople = Array.from(allPeople).sort();

  // Get action item thoughts
  const actionItemThoughts = thoughts.filter(
    (t) => t.metadata.action_items && t.metadata.action_items.length > 0
  );

  const typeEntries = Object.entries(stats.byType);
  const sourceEntries = Object.entries(stats.bySource);

  return (
    <SpaceBetween size="m">
      {/* Row 1: KPI Stats */}
      <Container>
        <ColumnLayout columns={4} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">Total Thoughts</Box>
            <KpiValue
              count={stats.totalInRange}
              hasData={thoughts.length > 0}
              onClick={() => setThoughtsModalVisible(true)}
            />
          </div>
          <div>
            <Box variant="awsui-key-label">Projects</Box>
            <KpiValue
              count={stats.projects.length}
              hasData={stats.projects.length > 0}
              onClick={() => setProjectsModalVisible(true)}
            />
          </div>
          <div>
            <Box variant="awsui-key-label">Action Items</Box>
            <KpiValue
              count={stats.actionItemCount}
              hasData={stats.actionItemCount > 0}
              onClick={() => setActionItemsVisible(true)}
            />
          </div>
          <div>
            <Box variant="awsui-key-label">People Mentioned</Box>
            <KpiValue
              count={allPeople.size}
              hasData={sortedPeople.length > 0}
              onClick={() => setPeopleModalVisible(true)}
            />
          </div>
        </ColumnLayout>
      </Container>

      {/* Row 2: Type | Source | Topics */}
      <Grid gridDefinition={[{ colspan: 4 }, { colspan: 4 }, { colspan: 4 }]}>
        <OverflowCard
          title="Type Breakdown"
          modalContent={
            <SpaceBetween size="xs">
              {typeEntries.map(([type, count]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ThoughtTypeBadge type={type} />
                  <Box variant="span">{count}</Box>
                </div>
              ))}
            </SpaceBetween>
          }
        >
          <SpaceBetween size="xs">
            {typeEntries.map(([type, count]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ThoughtTypeBadge type={type} />
                <Box variant="span">{count}</Box>
              </div>
            ))}
          </SpaceBetween>
        </OverflowCard>

        <OverflowCard
          title="Source Breakdown"
          modalContent={
            <SpaceBetween size="s">
              {sourceEntries.map(([source, count]) => (
                <div key={source} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Box variant="span">{source}</Box>
                  <Box variant="span" fontWeight="bold">{count}</Box>
                </div>
              ))}
            </SpaceBetween>
          }
        >
          <SpaceBetween size="xs">
            {sourceEntries.map(([source, count]) => (
              <div key={source} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Box variant="span">{source}</Box>
                <Box variant="span" fontWeight="bold">{count}</Box>
              </div>
            ))}
          </SpaceBetween>
        </OverflowCard>

        <OverflowCard
          title="Top Topics"
          modalContent={
            <SpaceBetween size="xs">
              {stats.topTopics.map((topic) => (
                <div key={topic.topic} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Box variant="span">{topic.topic}</Box>
                  <Box variant="span" color="text-status-inactive">{topic.count}</Box>
                </div>
              ))}
            </SpaceBetween>
          }
        >
          <SpaceBetween size="xs">
            {stats.topTopics.slice(0, 10).map((topic) => (
              <div key={topic.topic} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Box variant="span">{topic.topic}</Box>
                <Box variant="span" color="text-status-inactive">{topic.count}</Box>
              </div>
            ))}
          </SpaceBetween>
        </OverflowCard>
      </Grid>

      {/* Timeline Chart */}
      {thoughts.length > 0 && (
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
              Timeline
            </Header>
          }
        >
          <MixedLineBarChart
            height={250}
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
                // Top 10 topics only to keep the chart readable
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
      )}

      {/* Total Thoughts Modal */}
      <Modal
        visible={thoughtsModalVisible}
        onDismiss={() => setThoughtsModalVisible(false)}
        header={`All Thoughts (${thoughts.length})`}
        size="max"
        footer={
          <Box float="right">
            <Button variant="primary" onClick={() => setThoughtsModalVisible(false)}>Close</Button>
          </Box>
        }
      >
        <PaginatedThoughtTable items={thoughts} />
      </Modal>

      {/* Projects Modal */}
      <Modal
        visible={projectsModalVisible}
        onDismiss={() => setProjectsModalVisible(false)}
        header={`Projects (${stats.projects.length})`}
        size="medium"
        footer={
          <Box float="right">
            <Button variant="primary" onClick={() => setProjectsModalVisible(false)}>Close</Button>
          </Box>
        }
      >
        <Table
          columnDefinitions={[
            { id: 'project', header: 'Project', cell: (item) => item.project },
            { id: 'count', header: 'Thoughts', cell: (item) => item.count },
          ]}
          items={stats.projects.sort((a, b) => b.count - a.count)}
          variant="embedded"
        />
      </Modal>

      {/* Action Items Modal */}
      <Modal
        visible={actionItemsVisible}
        onDismiss={() => setActionItemsVisible(false)}
        header={`Action Items (${stats.actionItemCount})`}
        size="max"
        footer={
          <Box float="right">
            <Button variant="primary" onClick={() => setActionItemsVisible(false)}>Close</Button>
          </Box>
        }
      >
        <PaginatedThoughtTable items={actionItemThoughts} />
      </Modal>

      {/* People Mentioned Modal */}
      <Modal
        visible={peopleModalVisible}
        onDismiss={() => setPeopleModalVisible(false)}
        header={`People Mentioned (${allPeople.size})`}
        size="medium"
        footer={
          <Box float="right">
            <Button variant="primary" onClick={() => setPeopleModalVisible(false)}>Close</Button>
          </Box>
        }
      >
        <SpaceBetween size="xs">
          {sortedPeople.map((person) => (
            <Box key={person} variant="p">{person}</Box>
          ))}
        </SpaceBetween>
      </Modal>
    </SpaceBetween>
  );
}
