import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ActivityChartProps {
  buckets: Array<{ date: string; total: number; bySource: Record<string, number> }>;
  sources: string[];
}

const COLORS = ['#0972d3', '#037f0c', '#d97706', '#8b5cf6', '#ef4444', '#06b6d4'];

export function ActivityChart({ buckets, sources }: ActivityChartProps) {
  return (
    <Container header={<Header variant="h2">Activity Over Time</Header>}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={buckets}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          {sources.map((source, idx) => (
            <Bar
              key={source}
              dataKey={`bySource.${source}`}
              stackId="a"
              fill={COLORS[idx % COLORS.length]}
              name={source}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Container>
  );
}
