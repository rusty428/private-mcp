import SpaceBetween from '@cloudscape-design/components/space-between';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Box from '@cloudscape-design/components/box';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import { ThoughtTypeBadge } from '../../components/ThoughtTypeBadge';
import type { ThoughtRecord, TimeSeriesResponse } from '../../api/types';
import { format, startOfWeek, endOfWeek } from 'date-fns';

interface StructuredReportProps {
  thoughts: ThoughtRecord[];
  stats: TimeSeriesResponse;
}

function safeDate(thought: ThoughtRecord): Date {
  const raw = thought.metadata.thought_date || thought.metadata.created_at || '';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

function safeDateStr(thought: ThoughtRecord, fmt: string): string {
  try {
    return format(safeDate(thought), fmt);
  } catch {
    return 'Unknown';
  }
}

export function StructuredReport({ thoughts, stats }: StructuredReportProps) {
  // Group thoughts by week
  const thoughtsByWeek = thoughts.reduce((acc, thought) => {
    const date = safeDate(thought);
    const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
    const weekKey = format(weekStart, 'yyyy-MM-dd');
    if (!acc[weekKey]) {
      acc[weekKey] = [];
    }
    acc[weekKey].push(thought);
    return acc;
  }, {} as Record<string, ThoughtRecord[]>);

  const weekKeys = Object.keys(thoughtsByWeek).sort().reverse();

  // Get action items
  const actionItems = thoughts.filter(
    (t) => t.metadata.action_items && t.metadata.action_items.length > 0
  );

  // Get unique people mentioned
  const allPeople = new Set<string>();
  thoughts.forEach((t) => {
    t.metadata.people?.forEach((p) => allPeople.add(p));
  });

  return (
    <SpaceBetween size="l">
      <Container header={<Header variant="h2">Summary Statistics</Header>}>
        <ColumnLayout columns={4} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">Total Thoughts</Box>
            <Box variant="awsui-value-large">{stats.totalInRange}</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">Projects</Box>
            <Box variant="awsui-value-large">{stats.projects.length}</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">Action Items</Box>
            <Box variant="awsui-value-large">{stats.actionItemCount}</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">People Mentioned</Box>
            <Box variant="awsui-value-large">{allPeople.size}</Box>
          </div>
        </ColumnLayout>
      </Container>

      <Container header={<Header variant="h2">Type Breakdown</Header>}>
        <SpaceBetween size="xs">
          {Object.entries(stats.byType).map(([type, count]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ThoughtTypeBadge type={type} />
              <Box variant="span">{count}</Box>
            </div>
          ))}
        </SpaceBetween>
      </Container>

      <Container header={<Header variant="h2">Source Breakdown</Header>}>
        <ColumnLayout columns={2} variant="text-grid">
          {Object.entries(stats.bySource).map(([source, count]) => (
            <div key={source}>
              <Box variant="awsui-key-label">{source}</Box>
              <Box variant="awsui-value-large">{count}</Box>
            </div>
          ))}
        </ColumnLayout>
      </Container>

      {stats.topTopics.length > 0 && (
        <Container header={<Header variant="h2">Top Topics</Header>}>
          <SpaceBetween size="xs">
            {stats.topTopics.slice(0, 10).map((topic) => (
              <div
                key={topic.topic}
                style={{ display: 'flex', justifyContent: 'space-between' }}
              >
                <Box variant="span">{topic.topic}</Box>
                <Box variant="span" color="text-status-inactive">
                  {topic.count}
                </Box>
              </div>
            ))}
          </SpaceBetween>
        </Container>
      )}

      {allPeople.size > 0 && (
        <Container header={<Header variant="h2">People Mentioned</Header>}>
          <Box variant="p">{Array.from(allPeople).sort().join(', ')}</Box>
        </Container>
      )}

      {actionItems.length > 0 && (
        <Container header={<Header variant="h2">Open Action Items</Header>}>
          <SpaceBetween size="s">
            {actionItems.map((thought) => (
              <div key={thought.key}>
                <Box variant="small" color="text-status-inactive">
                  {thought.metadata.project || 'No project'} •{' '}
                  {safeDateStr(thought, 'MMM d, yyyy')}
                </Box>
                <ul style={{ marginTop: '4px', marginBottom: 0 }}>
                  {thought.metadata.action_items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </SpaceBetween>
        </Container>
      )}

      <Container header={<Header variant="h2">Timeline</Header>}>
        <SpaceBetween size="s">
          {weekKeys.map((weekKey) => {
            const weekThoughts = thoughtsByWeek[weekKey];
            const weekStart = new Date(weekKey);
            const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
            const weekLabel = `Week of ${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;

            return (
              <ExpandableSection key={weekKey} headerText={`${weekLabel} (${weekThoughts.length})`}>
                <SpaceBetween size="xs">
                  {weekThoughts.map((thought) => (
                    <div key={thought.key} style={{ paddingLeft: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ThoughtTypeBadge type={thought.metadata.type} />
                        <Box variant="small" color="text-status-inactive">
                          {safeDateStr(thought, 'MMM d')} •{' '}
                          {thought.metadata.project || 'No project'}
                        </Box>
                      </div>
                      <Box variant="p" margin={{ top: 'xxs' }}>
                        {thought.metadata.summary || thought.metadata.content}
                      </Box>
                    </div>
                  ))}
                </SpaceBetween>
              </ExpandableSection>
            );
          })}
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
