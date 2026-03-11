import { useState } from 'react';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import Textarea from '@cloudscape-design/components/textarea';
import Input from '@cloudscape-design/components/input';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Box from '@cloudscape-design/components/box';
import Badge from '@cloudscape-design/components/badge';
import FormField from '@cloudscape-design/components/form-field';
import { PendingIndicator } from '../../components/PendingIndicator';
import { api } from '../../api/client';
import type { CaptureResult } from '../../api/types';
import { format } from 'date-fns';

export function Capture() {
  const [text, setText] = useState('');
  const [project, setProject] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!text.trim()) {
      setError('Thought text is required');
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const captureResult = await api.capture({
        text: text.trim(),
        source: 'api',
        project: project.trim() || undefined,
      });
      setResult(captureResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to capture thought');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setText('');
    setProject('');
    setResult(null);
    setError(null);
  };

  const qualityColors: Record<string, 'green' | 'blue' | 'grey'> = {
    high: 'green',
    standard: 'blue',
    noise: 'grey',
  };

  return (
    <SpaceBetween size="l">
      <Header variant="h1">Capture Thought</Header>

      {!result && (
        <Container>
          <SpaceBetween size="m">
            <FormField label="Thought" errorText={error}>
              <Textarea
                value={text}
                onChange={(e) => {
                  setText(e.detail.value);
                  setError(null);
                }}
                placeholder="Enter your thought here..."
                rows={6}
                disabled={submitting}
              />
            </FormField>

            <FormField label="Project (optional)" description="Associate this thought with a project">
              <Input
                value={project}
                onChange={(e) => setProject(e.detail.value)}
                placeholder="e.g., AWSPrivateMCP"
                disabled={submitting}
              />
            </FormField>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={handleSubmit} loading={submitting}>
                Capture Thought
              </Button>
            </div>
          </SpaceBetween>
        </Container>
      )}

      {result && (
        <Container>
          <SpaceBetween size="m">
            <Box variant="h3">Thought Captured Successfully</Box>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div>
                <Box variant="awsui-key-label">Quality</Box>
                <Badge color={qualityColors[result.quality] || 'grey'}>
                  {result.quality}
                </Badge>
              </div>

              <div>
                <Box variant="awsui-key-label">Status</Box>
                <PendingIndicator />
              </div>

              <div>
                <Box variant="awsui-key-label">Captured</Box>
                <Box variant="span">
                  {(() => { const d = new Date(result.created_at || ''); return isNaN(d.getTime()) ? '-' : format(d, 'MMM d, yyyy h:mm a'); })()}
                </Box>
              </div>
            </div>

            <Box variant="p" color="text-status-inactive">
              Your thought has been captured and is being processed. Classification and enrichment
              will complete shortly.
            </Box>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="primary" onClick={handleReset}>
                Capture Another
              </Button>
              <Button href={`/browse?id=${result.id}`}>View Thought</Button>
            </div>
          </SpaceBetween>
        </Container>
      )}
    </SpaceBetween>
  );
}
