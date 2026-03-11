import { useNavigate } from 'react-router-dom';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import Table from '@cloudscape-design/components/table';
import Button from '@cloudscape-design/components/button';
import { ThoughtTypeBadge } from '../../components/ThoughtTypeBadge';
import type { ThoughtRecord } from '../../api/types';

interface RecentThoughtsProps {
  thoughts: ThoughtRecord[];
}

export function RecentThoughts({ thoughts }: RecentThoughtsProps) {
  const navigate = useNavigate();

  return (
    <Container
      header={
        <Header
          variant="h2"
          actions={
            <Button onClick={() => navigate('/browse')} iconName="external">
              View all
            </Button>
          }
        >
          Recent Thoughts
        </Header>
      }
    >
      <Table
        columnDefinitions={[
          {
            id: 'type',
            header: 'Type',
            cell: (item) => <ThoughtTypeBadge type={item.metadata.type} />,
            width: 140,
          },
          {
            id: 'summary',
            header: 'Summary',
            cell: (item) => item.metadata.summary,
          },
          {
            id: 'project',
            header: 'Project',
            cell: (item) => item.metadata.project,
            width: 150,
          },
          {
            id: 'source',
            header: 'Source',
            cell: (item) => item.metadata.source,
            width: 120,
          },
          {
            id: 'date',
            header: 'Date',
            cell: (item) => {
              const raw = item.metadata.thought_date || item.metadata.created_at || '';
              const d = new Date(raw);
              return isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
            },
            width: 120,
          },
        ]}
        items={thoughts}
        variant="embedded"
      />
    </Container>
  );
}
