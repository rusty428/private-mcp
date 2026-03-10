import { useState, useEffect } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import Alert from '@cloudscape-design/components/alert';
import FormField from '@cloudscape-design/components/form-field';
import Select from '@cloudscape-design/components/select';
import Input from '@cloudscape-design/components/input';
import { ThoughtTypeBadge } from '../../components/ThoughtTypeBadge';
import { ThoughtDetail } from './ThoughtDetail';
import { api } from '../../api/client';
import type { ThoughtRecord } from '../../api/types';
import { VALID_THOUGHT_TYPES } from '@shared-types/thought';

export function Browse() {
  const [thoughts, setThoughts] = useState<ThoughtRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedThought, setSelectedThought] = useState<ThoughtRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<{ label: string; value: string } | null>(null);
  const [projectFilter, setProjectFilter] = useState('');

  const loadThoughts = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, string> = {};
      if (typeFilter) params.type = typeFilter.value;
      if (projectFilter) params.project = projectFilter;
      const data = await api.listThoughts(params);
      setThoughts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thoughts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadThoughts();
  }, [typeFilter, projectFilter]);

  const handleRowClick = (thought: ThoughtRecord) => {
    setSelectedThought(thought);
    setEditing(false);
  };

  const handleEdit = () => {
    setEditing(true);
  };

  const handleSave = async (updates: Record<string, any>) => {
    if (!selectedThought) return;
    try {
      await api.editThought(selectedThought.key, updates);
      setEditing(false);
      await loadThoughts();
      // Update selected thought to reflect changes
      const updated = thoughts.find(t => t.key === selectedThought.key);
      if (updated) setSelectedThought(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleDeleteClick = () => {
    setDeleteModalVisible(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedThought) return;
    try {
      setDeleting(true);
      await api.deleteThought(selectedThought.key);
      setDeleteModalVisible(false);
      setSelectedThought(null);
      await loadThoughts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete thought');
    } finally {
      setDeleting(false);
    }
  };

  const typeOptions = [
    { label: 'All types', value: '' },
    ...VALID_THOUGHT_TYPES.map(t => ({ label: t, value: t })),
    { label: 'pending', value: 'pending' },
  ];

  return (
    <>
      <ContentLayout
        header={
          <Header
            variant="h1"
            description="Browse and manage all captured thoughts"
            actions={
              <Button iconName="refresh" onClick={loadThoughts} loading={loading}>
                Refresh
              </Button>
            }
          >
            Browse Thoughts
          </Header>
        }
      >
        <SpaceBetween size="l">
          {error && (
            <Alert type="error" dismissible onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          <SpaceBetween direction="horizontal" size="s">
            <FormField label="Type">
              <Select
                selectedOption={typeFilter}
                onChange={({ detail }) =>
                  setTypeFilter(detail.selectedOption.value ? detail.selectedOption as any : null)
                }
                options={typeOptions}
                placeholder="All types"
              />
            </FormField>

            <FormField label="Project">
              <Input
                value={projectFilter}
                onChange={({ detail }) => setProjectFilter(detail.value)}
                placeholder="Filter by project"
              />
            </FormField>
          </SpaceBetween>

          <div style={{ display: 'grid', gridTemplateColumns: selectedThought ? '1fr 1fr' : '1fr', gap: '1rem' }}>
            <Table
              columnDefinitions={[
                {
                  id: 'type',
                  header: 'Type',
                  cell: (item) => <ThoughtTypeBadge type={item.metadata.type} />,
                  sortingField: 'metadata.type',
                  width: 140,
                },
                {
                  id: 'summary',
                  header: 'Summary',
                  cell: (item) => item.metadata.summary || item.metadata.content.substring(0, 100) + '...',
                  sortingField: 'metadata.summary',
                },
                {
                  id: 'project',
                  header: 'Project',
                  cell: (item) => item.metadata.project || '-',
                  sortingField: 'metadata.project',
                  width: 150,
                },
                {
                  id: 'source',
                  header: 'Source',
                  cell: (item) => item.metadata.source,
                  sortingField: 'metadata.source',
                  width: 120,
                },
                {
                  id: 'date',
                  header: 'Date',
                  cell: (item) => new Date(item.metadata.thought_date).toLocaleDateString(),
                  sortingField: 'metadata.thought_date',
                  width: 120,
                },
              ]}
              items={thoughts}
              loading={loading}
              loadingText="Loading thoughts..."
              sortingDisabled={false}
              empty={
                <Box textAlign="center" color="inherit">
                  <b>No thoughts</b>
                  <Box padding={{ bottom: 's' }} variant="p" color="inherit">
                    No thoughts found matching your filters.
                  </Box>
                </Box>
              }
              onRowClick={({ detail }) => handleRowClick(detail.item)}
              selectedItems={selectedThought ? [selectedThought] : []}
              selectionType="single"
            />

            {selectedThought && (
              <Box padding="l">
                <ThoughtDetail
                  thought={selectedThought}
                  onEdit={handleEdit}
                  onDelete={handleDeleteClick}
                  editing={editing}
                  onSave={handleSave}
                  onCancel={handleCancelEdit}
                />
              </Box>
            )}
          </div>
        </SpaceBetween>
      </ContentLayout>

      <Modal
        visible={deleteModalVisible}
        onDismiss={() => setDeleteModalVisible(false)}
        header="Delete thought"
        closeAriaLabel="Close dialog"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteModalVisible(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeleteConfirm} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete this thought? This action cannot be undone.
      </Modal>
    </>
  );
}
