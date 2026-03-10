import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TopTopicsProps {
  topTopics: Array<{ topic: string; count: number }>;
}

export function TopTopics({ topTopics }: TopTopicsProps) {
  return (
    <Container header={<Header variant="h2">Top Topics</Header>}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={topTopics} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="topic" type="category" width={120} />
          <Tooltip />
          <Bar dataKey="count" fill="#0972d3" />
        </BarChart>
      </ResponsiveContainer>
    </Container>
  );
}
