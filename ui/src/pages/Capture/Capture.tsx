import { useState, useEffect } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import Textarea from '@cloudscape-design/components/textarea';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Alert from '@cloudscape-design/components/alert';
import FormField from '@cloudscape-design/components/form-field';
import Autosuggest from '@cloudscape-design/components/autosuggest';
import Table from '@cloudscape-design/components/table';
import Badge from '@cloudscape-design/components/badge';
import { api } from '../../api/client';
import type { CaptureResult } from '../../api/types';
import { format } from 'date-fns';
import { useDemoMode } from '../../contexts/DemoContext';

interface RecentCapture extends CaptureResult {
  text: string;
  project: string;
}

export function Capture() {
  const { isDemoMode } = useDemoMode();
  const [text, setText] = useState('');
  const [project, setProject] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [recentCaptures, setRecentCaptures] = useState<RecentCapture[]>([]);
  const [projectOptions, setProjectOptions] = useState<{ value: string }[]>([]);

  useEffect(() => {
    api.getTimeSeries({}).then((data) => {
      setProjectOptions(
        data.projects.map((p) => p.project).sort().map((p) => ({ value: p }))
      );
    }).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!text.trim()) {
      setError('Thought text is required');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await api.capture({
        text: text.trim(),
        source: 'api',
        project: project.trim() || undefined,
      });
      setRecentCaptures((prev) => [
        { ...result, text: text.trim(), project: project.trim() },
        ...prev,
      ].slice(0, 5));
      setText('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to capture thought');
    } finally {
      setSubmitting(false);
    }
  };

  const qualityColors: Record<string, 'green' | 'blue' | 'grey'> = {
    high: 'green',
    standard: 'blue',
    noise: 'grey',
  };

  return (
    <ContentLayout
      header={<Header variant="h1">Capture Thought</Header>}
    >
      <SpaceBetween size="l">
        {isDemoMode && (
          <Alert type="info">Capture is not available in demo mode.</Alert>
        )}
        {success && (
          <Alert
            type="success"
            dismissible
            onDismiss={() => setSuccess(false)}
          >
            Thought captured successfully. Classification and enrichment will complete shortly.
          </Alert>
        )}

        {error && (
          <Alert type="error" dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Container>
          <SpaceBetween size="m">
            <FormField label="Thought">
              <Textarea
                value={text}
                onChange={(e) => {
                  setText(e.detail.value);
                  setError(null);
                  setSuccess(false);
                }}
                placeholder="Enter your thought here..."
                rows={6}
                disabled={submitting || isDemoMode}
              />
            </FormField>

            <FormField label="Project" description="Select an existing project or type a new one">
              <Autosuggest
                value={project}
                onChange={({ detail }) => setProject(detail.value)}
                options={projectOptions}
                placeholder="e.g., AWSPrivateMCP"
                disabled={submitting || isDemoMode}
                enteredTextLabel={(value) => `Use: "${value}"`}
                empty="No matching projects"
              />
            </FormField>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={handleSubmit} loading={submitting} disabled={isDemoMode}>
                Capture Thought
              </Button>
            </div>
          </SpaceBetween>
        </Container>

        {recentCaptures.length > 0 && (
          <Table
            header={<Header variant="h2">Recent Captures</Header>}
            columnDefinitions={[
              {
                id: 'quality',
                header: 'Quality',
                cell: (item) => (
                  <Badge color={qualityColors[item.quality] || 'grey'}>
                    {item.quality}
                  </Badge>
                ),
                width: 100,
              },
              {
                id: 'text',
                header: 'Thought',
                cell: (item) => {
                  const display = item.text.length > 100 ? item.text.substring(0, 100) + '...' : item.text;
                  return display;
                },
              },
              {
                id: 'project',
                header: 'Project',
                cell: (item) => item.project || '-',
                width: 150,
              },
              {
                id: 'time',
                header: 'Captured',
                cell: (item) => {
                  const d = new Date(item.created_at || '');
                  return isNaN(d.getTime()) ? '-' : format(d, 'h:mm a');
                },
                width: 100,
              },
            ]}
            items={recentCaptures}
            variant="embedded"
          />
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
