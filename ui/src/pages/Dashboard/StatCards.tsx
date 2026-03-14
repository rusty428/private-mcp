import { useState } from 'react';
import Container from '@cloudscape-design/components/container';
import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Link from '@cloudscape-design/components/link';
import Modal from '@cloudscape-design/components/modal';
import Table from '@cloudscape-design/components/table';

interface ProjectCount {
  project: string;
  count: number;
}

interface StatCardsProps {
  total: number;
  projects: ProjectCount[];
}

export function StatCards({ total, projects }: StatCardsProps) {
  const [showProjectsModal, setShowProjectsModal] = useState(false);

  const sortedProjects = [...projects].sort((a, b) => b.count - a.count);
  const topProject = sortedProjects.length > 0 ? sortedProjects[0] : null;

  return (
    <>
      <Container>
        <ColumnLayout columns={3} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">Activity</Box>
            <Box variant="awsui-value-large">{total.toLocaleString()}</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">Active Projects</Box>
            <Box variant="awsui-value-large">
              <Link variant="primary" fontSize="inherit" onFollow={() => setShowProjectsModal(true)}>
                {projects.length.toLocaleString()}
              </Link>
            </Box>
          </div>
          <div>
            <Box variant="awsui-key-label">Top Project</Box>
            <Box fontSize="heading-l" fontWeight="bold">{topProject ? topProject.project : '-'}</Box>
            <Box color="text-body-secondary">
              {topProject ? `${topProject.count.toLocaleString()} thoughts` : 'No data'}
            </Box>
          </div>
        </ColumnLayout>
      </Container>

      <Modal
        visible={showProjectsModal}
        onDismiss={() => setShowProjectsModal(false)}
        header="Active Projects"
        size="medium"
      >
        <Table
          items={sortedProjects}
          columnDefinitions={[
            {
              id: 'project',
              header: 'Project',
              cell: (item) => item.project,
            },
            {
              id: 'count',
              header: 'Count',
              cell: (item) => item.count.toLocaleString(),
            },
          ]}
          variant="embedded"
          empty={
            <Box textAlign="center" padding="l">
              No projects in this period
            </Box>
          }
        />
      </Modal>
    </>
  );
}
