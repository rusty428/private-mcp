import { useState } from 'react';
import Form from '@cloudscape-design/components/form';
import SpaceBetween from '@cloudscape-design/components/space-between';
import FormField from '@cloudscape-design/components/form-field';
import Select from '@cloudscape-design/components/select';
import Input from '@cloudscape-design/components/input';
import Textarea from '@cloudscape-design/components/textarea';
import Button from '@cloudscape-design/components/button';
import Alert from '@cloudscape-design/components/alert';
import { VALID_THOUGHT_TYPES } from '@shared-types/thought';
import type { ThoughtRecord } from '../../api/types';

interface EditThoughtFormProps {
  thought: ThoughtRecord;
  onSave: (updates: Record<string, any>) => void;
  onCancel: () => void;
}

export function EditThoughtForm({ thought, onSave, onCancel }: EditThoughtFormProps) {
  const [type, setType] = useState({
    label: thought.metadata.type,
    value: thought.metadata.type,
  });
  const [topics, setTopics] = useState(thought.metadata.topics.join(', '));
  const [project, setProject] = useState(thought.metadata.project || '');
  const [summary, setSummary] = useState(thought.metadata.summary || '');

  if (thought.metadata.type === 'pending') {
    return (
      <Alert type="info">
        This thought is still being processed. Editing is not available until classification is complete.
      </Alert>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      type: type.value,
      topics: topics.split(',').map(t => t.trim()).filter(Boolean),
      project: project.trim(),
      summary: summary.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Form
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" variant="link" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary">Save</Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween direction="vertical" size="l">
          <FormField label="Type">
            <Select
              selectedOption={type}
              onChange={({ detail }) => setType(detail.selectedOption as any)}
              options={VALID_THOUGHT_TYPES.map(t => ({ label: t, value: t }))}
            />
          </FormField>

          <FormField label="Topics" description="Comma-separated">
            <Input value={topics} onChange={({ detail }) => setTopics(detail.value)} />
          </FormField>

          <FormField label="Project">
            <Input value={project} onChange={({ detail }) => setProject(detail.value)} />
          </FormField>

          <FormField label="Summary">
            <Textarea
              value={summary}
              onChange={({ detail }) => setSummary(detail.value)}
              rows={3}
            />
          </FormField>
        </SpaceBetween>
      </Form>
    </form>
  );
}
