import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface SourceBreakdownProps {
  bySource: Record<string, number>;
}

const COLORS = ['#0972d3', '#037f0c', '#d97706', '#8b5cf6', '#ef4444', '#06b6d4'];

export function SourceBreakdown({ bySource }: SourceBreakdownProps) {
  const data = Object.entries(bySource).map(([source, count], idx) => ({
    source,
    count,
    fill: COLORS[idx % COLORS.length],
  }));

  return (
    <Container header={<Header variant="h2">Breakdown by Source</Header>}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="source" type="category" width={120} />
          <Tooltip />
          <Bar dataKey="count" />
        </BarChart>
      </ResponsiveContainer>
    </Container>
  );
}
