import { useState, useEffect } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import Alert from '@cloudscape-design/components/alert';
import TextFilter from '@cloudscape-design/components/text-filter';
import Select from '@cloudscape-design/components/select';
import { ThoughtTypeBadge } from '../../components/ThoughtTypeBadge';
import { ProjectSelect } from '../../components/ProjectSelect';
import { ThoughtDetail } from './ThoughtDetail';
import { api } from '../../api/client';
import type { ThoughtRecord } from '../../api/types';
import { VALID_THOUGHT_TYPES } from '@shared-types/thought';

export function Browse() {
  const [thoughts, setThoughts] = useState<ThoughtRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<ThoughtRecord[]>([]);
  const [editing, setEditing] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Filters
  const [filterText, setFilterText] = useState('');
  const [typeFilter, setTypeFilter] = useState<{ label: string; value: string } | null>(null);
  const [projectFilter, setProjectFilter] = useState<{ label: string; value: string } | null>(null);

  const loadThoughts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listThoughts({ limit: '1000' });
      setThoughts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thoughts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadThoughts();
  }, []);

  // Client-side filtering
  const filteredThoughts = thoughts.filter((t) => {
    if (typeFilter && t.metadata.type !== typeFilter.value) return false;
    if (projectFilter && t.metadata.project !== projectFilter.value) return false;
    if (filterText) {
      const text = filterText.toLowerCase();
      const summary = (t.metadata.summary || '').toLowerCase();
      const content = (t.metadata.content || '').toLowerCase();
      const project = (t.metadata.project || '').toLowerCase();
      if (!summary.includes(text) && !content.includes(text) && !project.includes(text)) return false;
    }
    return true;
  });

  const typeOptions = [
    ...VALID_THOUGHT_TYPES.map((t) => ({ label: t, value: t })),
    { label: 'pending', value: 'pending' },
  ];

  const handleView = () => {
    setEditing(false);
    setDetailVisible(true);
  };

  const handleEdit = () => {
    setEditing(true);
    setDetailVisible(true);
  };

  const handleSave = async (updates: Record<string, any>) => {
    if (selectedItems.length !== 1) return;
    try {
      await api.editThought(selectedItems[0].key, updates);
      setEditing(false);
      setDetailVisible(false);
      await loadThoughts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  const handleDeleteClick = () => {
    setDeleteModalVisible(true);
  };

  const handleDeleteConfirm = async () => {
    if (selectedItems.length === 0) return;
    try {
      setDeleting(true);
      await Promise.all(selectedItems.map((item) => api.deleteThought(item.key)));
      setDeleteModalVisible(false);
      setDetailVisible(false);
      setSelectedItems([]);
      await loadThoughts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete thoughts');
    } finally {
      setDeleting(false);
    }
  };

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

          <Table
            header={
              <Header
                counter={
                  selectedItems.length
                    ? `(${selectedItems.length}/${filteredThoughts.length})`
                    : `(${filteredThoughts.length})`
                }
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button disabled={selectedItems.length !== 1} onClick={handleView}>
                      View
                    </Button>
                    <Button disabled={selectedItems.length === 0} onClick={handleDeleteClick}>
                      Delete
                    </Button>
                  </SpaceBetween>
                }
              >
                Thoughts
              </Header>
            }
            filter={
              <SpaceBetween direction="horizontal" size="xs">
                <TextFilter
                  filteringText={filterText}
                  onChange={({ detail }) => setFilterText(detail.filteringText)}
                  filteringPlaceholder="Search thoughts..."
                  countText={`${filteredThoughts.length} matches`}
                />
                <Select
                  selectedOption={typeFilter}
                  onChange={({ detail }) =>
                    setTypeFilter(detail.selectedOption.value ? (detail.selectedOption as any) : null)
                  }
                  options={[{ label: 'All types', value: '' }, ...typeOptions]}
                  placeholder="All types"
                />
                <ProjectSelect
                  selectedOption={projectFilter}
                  onChange={setProjectFilter}
                />
              </SpaceBetween>
            }
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
                cell: (item) => {
                  const text = item.metadata.summary || item.metadata.content || '';
                  return text.length > 100 ? text.substring(0, 100) + '...' : text;
                },
                sortingField: 'metadata.summary',
                maxWidth: 400,
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
                cell: (item) => {
                  const raw = item.metadata.thought_date || item.metadata.created_at || '';
                  const d = new Date(raw);
                  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
                },
                sortingField: 'metadata.thought_date',
                width: 120,
              },
            ]}
            items={filteredThoughts}
            loading={loading}
            loadingText="Loading thoughts..."
            sortingDisabled={false}
            stickyHeader
            empty={
              <Box textAlign="center" color="inherit">
                <b>No thoughts</b>
                <Box padding={{ bottom: 's' }} variant="p" color="inherit">
                  No thoughts found matching your filters.
                </Box>
              </Box>
            }
            onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
            selectedItems={selectedItems}
            selectionType="multi"
          />
        </SpaceBetween>
      </ContentLayout>

      <Modal
        visible={detailVisible && selectedItems.length === 1}
        onDismiss={() => setDetailVisible(false)}
        header="Thought Details"
        closeAriaLabel="Close details"
        size="large"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDetailVisible(false)}>
                Close
              </Button>
              <Button onClick={handleEdit}>Edit</Button>
              <Button onClick={handleDeleteClick}>Delete</Button>
            </SpaceBetween>
          </Box>
        }
      >
        {selectedItems.length === 1 && (
          <ThoughtDetail
            thought={selectedItems[0]}
            editing={editing}
            onSave={handleSave}
            onCancel={() => { setEditing(false); setDetailVisible(false); }}
          />
        )}
      </Modal>

      <Modal
        visible={deleteModalVisible}
        onDismiss={() => setDeleteModalVisible(false)}
        header={`Delete ${selectedItems.length === 1 ? 'thought' : `${selectedItems.length} thoughts`}`}
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
        Are you sure you want to delete {selectedItems.length === 1 ? 'this thought' : `these ${selectedItems.length} thoughts`}? This action cannot be undone.
      </Modal>
    </>
  );
}
