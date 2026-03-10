import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TypeBreakdownProps {
  byType: Record<string, number>;
}

const TYPE_COLORS: Record<string, string> = {
  decision: '#0972d3',
  observation: '#d97706',
  task: '#037f0c',
  idea: '#8b5cf6',
  reference: '#ef4444',
  person_note: '#06b6d4',
  project_summary: '#ec4899',
  milestone: '#14b8a6',
  pending: '#9ca3af',
};

export function TypeBreakdown({ byType }: TypeBreakdownProps) {
  const data = Object.entries(byType).map(([type, count]) => ({
    type,
    count,
    fill: TYPE_COLORS[type] || '#9ca3af',
  }));

  return (
    <Container header={<Header variant="h2">Breakdown by Type</Header>}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="type" type="category" width={120} />
          <Tooltip />
          <Bar dataKey="count" />
        </BarChart>
      </ResponsiveContainer>
    </Container>
  );
}
