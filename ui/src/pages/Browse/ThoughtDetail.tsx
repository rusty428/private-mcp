import SpaceBetween from '@cloudscape-design/components/space-between';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Box from '@cloudscape-design/components/box';
import { ThoughtTypeBadge } from '../../components/ThoughtTypeBadge';
import type { ThoughtRecord } from '../../api/types';
import { parseLocalDate } from '../../utils/parseDate';

interface ThoughtDetailProps {
  thought: ThoughtRecord;
}

export function ThoughtDetail({ thought }: ThoughtDetailProps) {
  return (
    <SpaceBetween size="l">
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
          <div>{(() => { const d = parseLocalDate(thought.metadata.thought_date || thought.metadata.created_at || ''); return isNaN(d.getTime()) ? '-' : d.toLocaleString(); })()}</div>
        </div>

        <div>
          <Box variant="awsui-key-label">Session</Box>
          <div>{thought.metadata.session_name || '-'}</div>
        </div>
      </ColumnLayout>

      <div>
        <Box variant="awsui-key-label">Topics</Box>
        <div>{thought.metadata.topics?.length > 0 ? thought.metadata.topics.join(', ') : '-'}</div>
      </div>

      <div>
        <Box variant="awsui-key-label">Summary</Box>
        <div>{thought.metadata.summary || '-'}</div>
      </div>

      <div>
        <Box variant="awsui-key-label">Content</Box>
        <div style={{ whiteSpace: 'pre-wrap' }}>{thought.metadata.content}</div>
      </div>

      {thought.metadata.people?.length > 0 && (
        <div>
          <Box variant="awsui-key-label">People Mentioned</Box>
          <div>{thought.metadata.people.join(', ')}</div>
        </div>
      )}

      {thought.metadata.action_items?.length > 0 && (
        <div>
          <Box variant="awsui-key-label">Action Items</Box>
          <ul>
            {thought.metadata.action_items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {thought.metadata.dates_mentioned?.length > 0 && (
        <div>
          <Box variant="awsui-key-label">Dates Mentioned</Box>
          <div>{thought.metadata.dates_mentioned.join(', ')}</div>
        </div>
      )}

      {thought.metadata.related_projects?.length > 0 && (
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
