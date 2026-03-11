import { useNavigate } from 'react-router-dom';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import { ThoughtTypeBadge } from '../../components/ThoughtTypeBadge';
import type { SearchResult } from '../../api/types';

interface SearchResultCardProps {
  result: SearchResult;
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return 'Unknown date';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Unknown date';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Unknown date';
  }
}

export function SearchResultCard({ result }: SearchResultCardProps) {
  const navigate = useNavigate();

  // Debug logging — remove after fixing
  console.log('SearchResultCard rendering:', JSON.stringify(result, null, 2));

  try {
    const { key, distance, metadata } = result;
    const relevanceScore = Math.round((1 - distance) * 100);
    const dateDisplay = formatDate(metadata?.thought_date || metadata?.created_at);

    return (
      <div onClick={() => navigate(`/browse?id=${key}`)} style={{ cursor: 'pointer' }}>
        <Container fitHeight>
        <SpaceBetween size="s">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ThoughtTypeBadge type={metadata?.type || 'pending'} />
            <Box color="text-status-info" fontWeight="bold">
              {relevanceScore}% match
            </Box>
          </div>

          <Box variant="p">
            {metadata?.summary || metadata?.content || 'No content'}
          </Box>

          <div style={{ display: 'flex', gap: '16px', fontSize: '0.875rem', color: 'var(--color-text-status-inactive)' }}>
            {metadata?.project && <span>Project: {metadata.project}</span>}
            <span>Source: {metadata?.source || 'unknown'}</span>
            <span>{dateDisplay}</span>
          </div>
        </SpaceBetween>
        </Container>
      </div>
    );
  } catch (err) {
    console.error('SearchResultCard render error:', err, 'Result data:', result);
    return <div>Error rendering result: {String(err)}</div>;
  }
}
