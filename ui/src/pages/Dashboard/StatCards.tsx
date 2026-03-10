import Container from '@cloudscape-design/components/container';
import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';

interface StatCardsProps {
  total: number;
  periodCount: number;
  actionItems: number;
  projectCount: number;
}

export function StatCards({ total, periodCount, actionItems, projectCount }: StatCardsProps) {
  return (
    <Container>
      <ColumnLayout columns={4} variant="text-grid">
        <div>
          <Box variant="awsui-key-label">Total Thoughts</Box>
          <Box variant="awsui-value-large">{total.toLocaleString()}</Box>
        </div>
        <div>
          <Box variant="awsui-key-label">This Period</Box>
          <Box variant="awsui-value-large">{periodCount.toLocaleString()}</Box>
        </div>
        <div>
          <Box variant="awsui-key-label">Action Items</Box>
          <Box variant="awsui-value-large">{actionItems.toLocaleString()}</Box>
        </div>
        <div>
          <Box variant="awsui-key-label">Active Projects</Box>
          <Box variant="awsui-value-large">{projectCount.toLocaleString()}</Box>
        </div>
      </ColumnLayout>
    </Container>
  );
}
