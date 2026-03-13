import { useState, useEffect, useRef } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Icon from '@cloudscape-design/components/icon';
import Modal from '@cloudscape-design/components/modal';
import Alert from '@cloudscape-design/components/alert';
import Pagination from '@cloudscape-design/components/pagination';
import CollectionPreferences from '@cloudscape-design/components/collection-preferences';
import TextFilter from '@cloudscape-design/components/text-filter';
import Select from '@cloudscape-design/components/select';
import { ThoughtTypeBadge } from '../../components/ThoughtTypeBadge';
import { ProjectSelect } from '../../components/ProjectSelect';
import { ThoughtDetail } from './ThoughtDetail';
import { EditThoughtForm, type EditThoughtFormHandle } from './EditThoughtForm';
import { api } from '../../api/client';
import type { ThoughtRecord } from '../../api/types';
import { parseLocalDate } from '../../utils/parseDate';
import { VALID_THOUGHT_TYPES } from '@shared-types/thought';

export function Browse() {
  const [thoughts, setThoughts] = useState<ThoughtRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<ThoughtRecord[]>([]);
  const [detailItem, setDetailItem] = useState<ThoughtRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const editFormRef = useRef<EditThoughtFormHandle>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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

  const pageCount = Math.ceil(filteredThoughts.length / pageSize);
  const paginatedThoughts = filteredThoughts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const typeOptions = [
    ...VALID_THOUGHT_TYPES.map((t) => ({ label: t, value: t })),
    { label: 'pending', value: 'pending' },
  ];

  const openDetail = (item: ThoughtRecord) => {
    setDetailItem(item);
    setEditing(false);
    setDetailVisible(true);
  };

  const openEdit = (item: ThoughtRecord) => {
    setDetailItem(item);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!detailItem || !editFormRef.current) return;
    try {
      const updates = editFormRef.current.getUpdates();
      await api.editThought(detailItem.key, updates);
      setEditing(false);
      await loadThoughts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  const handleDeleteClick = () => {
    setDeleteModalVisible(true);
  };

  const handleDeleteConfirm = async () => {
    const itemsToDelete = (detailVisible || editing) && detailItem ? [detailItem] : selectedItems;
    if (itemsToDelete.length === 0) return;
    try {
      setDeleting(true);
      await Promise.all(itemsToDelete.map((item) => api.deleteThought(item.key)));
      setDeleteModalVisible(false);
      setDetailVisible(false);
      setEditing(false);
      setDetailItem(null);
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
                  <Button disabled={selectedItems.length === 0} onClick={handleDeleteClick}>
                    Delete
                  </Button>
                }
              >
                Thoughts
              </Header>
            }
            filter={
              <SpaceBetween direction="horizontal" size="xs">
                <TextFilter
                  filteringText={filterText}
                  onChange={({ detail }) => { setFilterText(detail.filteringText); setCurrentPage(1); }}
                  filteringPlaceholder="Search thoughts..."
                  countText={`${filteredThoughts.length} matches`}
                />
                <Select
                  selectedOption={typeFilter}
                  onChange={({ detail }) => {
                    setTypeFilter(detail.selectedOption.value ? (detail.selectedOption as any) : null);
                    setCurrentPage(1);
                  }}
                  options={[{ label: 'All types', value: '' }, ...typeOptions]}
                  placeholder="All types"
                />
                <ProjectSelect
                  selectedOption={projectFilter}
                  onChange={(opt) => { setProjectFilter(opt); setCurrentPage(1); }}
                />
              </SpaceBetween>
            }
            columnDefinitions={[
              {
                id: 'type',
                header: 'Type',
                cell: (item) => (
                  <div style={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                    <ThoughtTypeBadge type={item.metadata.type} />
                  </div>
                ),
                sortingField: 'metadata.type',
                width: 140,
              },
              {
                id: 'summary',
                header: 'Summary',
                cell: (item) => {
                  const text = item.metadata.summary || item.metadata.content || '';
                  const display = text.length > 100 ? text.substring(0, 100) + '...' : text;
                  return (
                    <div style={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                      {display}
                    </div>
                  );
                },
                sortingField: 'metadata.summary',
                maxWidth: 400,
              },
              {
                id: 'project',
                header: 'Project',
                cell: (item) => (
                  <div style={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                    {item.metadata.project || '-'}
                  </div>
                ),
                sortingField: 'metadata.project',
                width: 150,
              },
              {
                id: 'source',
                header: 'Source',
                cell: (item) => (
                  <div style={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                    {item.metadata.source}
                  </div>
                ),
                sortingField: 'metadata.source',
                width: 120,
              },
              {
                id: 'date',
                header: 'Date',
                cell: (item) => {
                  const raw = item.metadata.thought_date || item.metadata.created_at || '';
                  const d = parseLocalDate(raw);
                  return (
                    <div style={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                      {isNaN(d.getTime()) ? '-' : d.toLocaleDateString()}
                    </div>
                  );
                },
                sortingField: 'metadata.thought_date',
                width: 120,
              },
              {
                id: 'actions',
                header: '',
                cell: (item) => (
                  <SpaceBetween direction="horizontal" size="xs">
                    <span
                      style={{ cursor: 'pointer', color: 'var(--color-text-link-default)' }}
                      onClick={() => openDetail(item)}
                      title="View details"
                    >
                      <Icon name="status-info" />
                    </span>
                    <span
                      style={{ cursor: 'pointer', color: 'var(--color-text-link-default)' }}
                      onClick={() => openEdit(item)}
                      title="Edit"
                    >
                      <Icon name="edit" />
                    </span>
                  </SpaceBetween>
                ),
                width: 80,
              },
            ]}
            items={paginatedThoughts}
            loading={loading}
            loadingText="Loading thoughts..."
            sortingDisabled={false}
            stickyHeader
            pagination={
              <Pagination
                currentPageIndex={currentPage}
                pagesCount={pageCount}
                onChange={({ detail }) => setCurrentPage(detail.currentPageIndex)}
              />
            }
            preferences={
              <CollectionPreferences
                title="Preferences"
                confirmLabel="Confirm"
                cancelLabel="Cancel"
                pageSizePreference={{
                  title: 'Page size',
                  options: [
                    { value: 10, label: '10 thoughts' },
                    { value: 25, label: '25 thoughts' },
                    { value: 50, label: '50 thoughts' },
                    { value: 100, label: '100 thoughts' },
                  ],
                }}
                preferences={{ pageSize }}
                onConfirm={({ detail }) => {
                  setPageSize(detail.pageSize ?? 25);
                  setCurrentPage(1);
                }}
              />
            }
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
        visible={detailVisible && detailItem !== null}
        onDismiss={() => setDetailVisible(false)}
        header="Thought Details"
        closeAriaLabel="Close details"
        size="large"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button variant="link" onClick={handleDeleteClick}>Delete</Button>
            <Button variant="primary" onClick={() => setDetailVisible(false)}>
              Close
            </Button>
          </div>
        }
      >
        {detailItem && <ThoughtDetail thought={detailItem} />}
      </Modal>

      <Modal
        visible={editing && detailItem !== null}
        onDismiss={() => setEditing(false)}
        header="Edit Thought"
        closeAriaLabel="Close editor"
        size="large"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button variant="link" onClick={handleDeleteClick}>Delete</Button>
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setEditing(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleSave}>Save</Button>
            </SpaceBetween>
          </div>
        }
      >
        {detailItem && <EditThoughtForm ref={editFormRef} thought={detailItem} />}
      </Modal>

      <Modal
        visible={deleteModalVisible}
        onDismiss={() => setDeleteModalVisible(false)}
        header={(() => {
          const count = (detailVisible || editing) && detailItem ? 1 : selectedItems.length;
          return `Delete ${count === 1 ? 'thought' : `${count} thoughts`}`;
        })()}
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
        {(() => {
          const count = (detailVisible || editing) && detailItem ? 1 : selectedItems.length;
          return `Are you sure you want to delete ${count === 1 ? 'this thought' : `these ${count} thoughts`}? This action cannot be undone.`;
        })()}
      </Modal>
    </>
  );
}
