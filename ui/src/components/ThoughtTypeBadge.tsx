import Badge from '@cloudscape-design/components/badge';

const TYPE_COLORS: Record<string, 'blue' | 'grey' | 'green' | 'red'> = {
  decision: 'blue',
  observation: 'grey',
  task: 'green',
  idea: 'blue',
  reference: 'grey',
  person_note: 'grey',
  project_summary: 'blue',
  milestone: 'green',
  pending: 'grey',
};

interface ThoughtTypeBadgeProps {
  type: string;
}

export function ThoughtTypeBadge({ type }: ThoughtTypeBadgeProps) {
  if (type === 'pending') {
    return <Badge color="grey">Processing...</Badge>;
  }
  const color = TYPE_COLORS[type] || 'grey';
  return <Badge color={color}>{type}</Badge>;
}
