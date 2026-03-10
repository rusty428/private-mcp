import { useState } from 'react';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import Button from '@cloudscape-design/components/button';
import Spinner from '@cloudscape-design/components/spinner';
import Box from '@cloudscape-design/components/box';
import { api } from '../../api/client';

interface NarrativeSectionProps {
  startDate: string;
  endDate: string;
  project?: string;
}

export function NarrativeSection({ startDate, endDate, project }: NarrativeSectionProps) {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const response = await api.generateNarrative({ startDate, endDate, project });
      setNarrative(response.narrative);
    } catch (error) {
      console.error('Failed to generate narrative:', error);
      setNarrative('Failed to generate narrative. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container
      header={
        <Header
          variant="h2"
          actions={
            !narrative && (
              <Button onClick={handleGenerate} loading={loading}>
                Generate Narrative
              </Button>
            )
          }
        >
          AI-Generated Narrative
        </Header>
      }
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spinner size="large" />
          <Box variant="p" margin={{ top: 's' }}>
            Generating narrative summary...
          </Box>
        </div>
      )}

      {!loading && !narrative && (
        <Box textAlign="center" color="text-status-inactive" padding="xl">
          Click "Generate Narrative" to create an AI-powered summary of this period
        </Box>
      )}

      {!loading && narrative && (
        <Box variant="p">
          <div style={{ whiteSpace: 'pre-wrap' }}>{narrative}</div>
        </Box>
      )}
    </Container>
  );
}
