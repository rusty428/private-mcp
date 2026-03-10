import SpaceBetween from '@cloudscape-design/components/space-between';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Header from '@cloudscape-design/components/header';
import { ThoughtTypeBadge } from '../../components/ThoughtTypeBadge';
import { EditThoughtForm } from './EditThoughtForm';
import type { ThoughtRecord } from '../../api/types';

interface ThoughtDetailProps {
  thought: ThoughtRecord;
  onEdit: () => void;
  onDelete: () => void;
  editing: boolean;
  onSave: (updates: Record<string, any>) => void;
  onCancel: () => void;
}

export function ThoughtDetail({
  thought,
  onEdit,
  onDelete,
  editing,
  onSave,
  onCancel,
}: ThoughtDetailProps) {
  if (editing) {
    return (
      <SpaceBetween size="l">
        <Header variant="h2">Edit Thought</Header>
        <EditThoughtForm thought={thought} onSave={onSave} onCancel={onCancel} />
      </SpaceBetween>
    );
  }

  return (
    <SpaceBetween size="l">
      <Header
        variant="h2"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={onEdit}>Edit</Button>
            <Button onClick={onDelete}>Delete</Button>
          </SpaceBetween>
        }
      >
        Thought Details
      </Header>

      <ColumnLayout columns={2} variant="text-grid">
        <div>
          <Box variant="awsui-key-label">Type</Box>
          <ThoughtTypeBadge type={thought.metadata.type} />
        </div>

        <div>
          <Box variant="awsui-key-label">Source</Box>
          <div>{thought.metadata.source}</div>
        </div>

        <div>
          <Box variant="awsui-key-label">Project</Box>
          <div>{thought.metadata.project || '-'}</div>
        </div>

        <div>
          <Box variant="awsui-key-label">Quality</Box>
          <div>{thought.metadata.quality}</div>
        </div>

        <div>
          <Box variant="awsui-key-label">Date</Box>
          <div>{new Date(thought.metadata.thought_date).toLocaleString()}</div>
        </div>

        <div>
          <Box variant="awsui-key-label">Session</Box>
          <div>{thought.metadata.session_name || '-'}</div>
        </div>
      </ColumnLayout>

      <div>
        <Box variant="awsui-key-label">Topics</Box>
        <div>{thought.metadata.topics.length > 0 ? thought.metadata.topics.join(', ') : '-'}</div>
      </div>

      <div>
        <Box variant="awsui-key-label">Summary</Box>
        <div>{thought.metadata.summary || '-'}</div>
      </div>

      <div>
        <Box variant="awsui-key-label">Content</Box>
        <div style={{ whiteSpace: 'pre-wrap' }}>{thought.metadata.content}</div>
      </div>

      {thought.metadata.people.length > 0 && (
        <div>
          <Box variant="awsui-key-label">People Mentioned</Box>
          <div>{thought.metadata.people.join(', ')}</div>
        </div>
      )}

      {thought.metadata.action_items.length > 0 && (
        <div>
          <Box variant="awsui-key-label">Action Items</Box>
          <ul>
            {thought.metadata.action_items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {thought.metadata.dates_mentioned.length > 0 && (
        <div>
          <Box variant="awsui-key-label">Dates Mentioned</Box>
          <div>{thought.metadata.dates_mentioned.join(', ')}</div>
        </div>
      )}

      {thought.metadata.related_projects.length > 0 && (
        <div>
          <Box variant="awsui-key-label">Related Projects</Box>
          <div>{thought.metadata.related_projects.join(', ')}</div>
        </div>
      )}

      <div>
        <Box variant="awsui-key-label">ID</Box>
        <div style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{thought.key}</div>
      </div>
    </SpaceBetween>
  );
}
