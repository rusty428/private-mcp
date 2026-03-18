import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import Table from '@cloudscape-design/components/table';
import Button from '@cloudscape-design/components/button';
import Box from '@cloudscape-design/components/box';
import Icon from '@cloudscape-design/components/icon';
import Modal from '@cloudscape-design/components/modal';
import { ThoughtTypeBadge } from '../../components/ThoughtTypeBadge';
import { ThoughtDetail } from '../Browse/ThoughtDetail';
import type { ThoughtRecord } from '../../api/types';
import { parseLocalDate } from '../../utils/parseDate';

interface RecentThoughtsProps {
  thoughts: ThoughtRecord[];
}

export function RecentThoughts({ thoughts }: RecentThoughtsProps) {
  const navigate = useNavigate();
  const [detailItem, setDetailItem] = useState<ThoughtRecord | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const openDetail = (item: ThoughtRecord) => {
    setDetailItem(item);
    setDetailVisible(true);
  };

  return (
    <>
      <Container
        header={
          <Header
            variant="h2"
            actions={
              <Button onClick={() => navigate('/browse')}>
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
              cell: (item) => (
                <div style={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                  <ThoughtTypeBadge type={item.metadata.type} />
                </div>
              ),
              width: 120,
            },
            {
              id: 'summary',
              header: 'Summary',
              cell: (item) => {
                const text = item.metadata.summary || item.metadata.content || '';
                const display = text.length > 100 ? text.substring(0, 100) + '...' : text;
                return (
                  <div style={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                    {display}
                  </div>
                );
              },
            },
            {
              id: 'project',
              header: 'Project',
              cell: (item) => (
                <div style={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                  {item.metadata.project || '-'}
                </div>
              ),
              width: 120,
            },
            {
              id: 'source',
              header: 'Source',
              cell: (item) => (
                <div style={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                  {item.metadata.source}
                </div>
              ),
              width: 90,
            },
            {
              id: 'date',
              header: 'Date',
              cell: (item) => {
                const raw = item.metadata.thought_date || item.metadata.created_at || '';
                const d = parseLocalDate(raw);
                return (
                  <div style={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                    {isNaN(d.getTime()) ? '-' : d.toLocaleDateString()}
                  </div>
                );
              },
              width: 100,
            },
            {
              id: 'actions',
              header: '',
              cell: (item) => (
                <span
                  style={{ cursor: 'pointer', color: 'var(--color-text-link-default)' }}
                  onClick={() => openDetail(item)}
                  title="View details"
                >
                  <Icon name="status-info" />
                </span>
              ),
              width: 40,
            },
          ]}
          items={thoughts}
          variant="embedded"
        />
      </Container>

      <Modal
        visible={detailVisible && detailItem !== null}
        onDismiss={() => setDetailVisible(false)}
        header="Thought Details"
        closeAriaLabel="Close details"
        size="large"
        footer={
          <Box float="right">
            <Button variant="primary" onClick={() => setDetailVisible(false)}>
              Close
            </Button>
          </Box>
        }
      >
        {detailItem && <ThoughtDetail thought={detailItem} />}
      </Modal>
    </>
  );
}
