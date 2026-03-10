import { useNavigate } from 'react-router-dom';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import { ThoughtTypeBadge } from '../../components/ThoughtTypeBadge';
import type { SearchResult } from '../../api/types';
import { format } from 'date-fns';

interface SearchResultCardProps {
  result: SearchResult;
}

export function SearchResultCard({ result }: SearchResultCardProps) {
  const navigate = useNavigate();
  const { key, distance, metadata } = result;
  const relevanceScore = Math.round((1 - distance) * 100);

  return (
    <div onClick={() => navigate(`/browse?id=${key}`)} style={{ cursor: 'pointer' }}>
      <Container fitHeight>
      <SpaceBetween size="s">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ThoughtTypeBadge type={metadata.type} />
          <Box color="text-status-info" fontWeight="bold">
            {relevanceScore}% match
          </Box>
        </div>

        <Box variant="p">
          {metadata.summary || metadata.content}
        </Box>

        <div style={{ display: 'flex', gap: '16px', fontSize: '0.875rem', color: 'var(--color-text-status-inactive)' }}>
          {metadata.project && <span>Project: {metadata.project}</span>}
          <span>Source: {metadata.source}</span>
          <span>{format(new Date(metadata.thought_date), 'MMM d, yyyy')}</span>
        </div>
      </SpaceBetween>
      </Container>
    </div>
  );
}
