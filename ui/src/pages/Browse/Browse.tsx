import { useState, useEffect, useCallback, useRef } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Icon from '@cloudscape-design/components/icon';
import Modal from '@cloudscape-design/components/modal';
import Alert from '@cloudscape-design/components/alert';
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
  const [items, setItems] = useState<ThoughtRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [currentToken, setCurrentToken] = useState<string | undefined>(undefined);
  const [tokenStack, setTokenStack] = useState<string[]>([]);
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

  const loadPage = useCallback(async (token?: string) => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, string> = { pageSize: String(pageSize) };
      if (token) params.nextToken = token;
      if (typeFilter?.value) params.type = typeFilter.value;
      if (projectFilter?.value) params.project = projectFilter.value;
      const data = await api.listThoughts(params);
      setItems(data.items);
      setHasMore(data.hasMore);
      setCurrentToken(data.nextToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thoughts');
    } finally {
      setLoading(false);
    }
  }, [pageSize, typeFilter, projectFilter]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  // Client-side text filter (filters within loaded page only)
  const displayedItems = items.filter((t) => {
    if (!filterText) return true;
    const text = filterText.toLowerCase();
    const summary = (t.metadata.summary || '').toLowerCase();
    const content = (t.metadata.content || '').toLowerCase();
    const project = (t.metadata.project || '').toLowerCase();
    return summary.includes(text) || content.includes(text) || project.includes(text);
  });

  const handleNextPage = () => {
    if (currentToken) {
      setTokenStack(prev => [...prev, currentToken]);
      setCurrentPage(prev => prev + 1);
      loadPage(currentToken);
    }
  };

  const handlePreviousPage = () => {
    const stack = [...tokenStack];
    stack.pop();
    const prevToken = stack.length > 0 ? stack[stack.length - 1] : undefined;
    setTokenStack(stack);
    setCurrentPage(prev => prev - 1);
    loadPage(prevToken);
  };

  const resetPagination = () => {
    setTokenStack([]);
    setCurrentPage(1);
  };

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
      await loadPage();
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
      await loadPage();
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
              <Button iconName="refresh" onClick={() => loadPage()} loading={loading}>
                Refresh
              </Button>
            }
          >
            Browse Recent
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
                    ? `(${selectedItems.length}/${displayedItems.length})`
                    : `(${displayedItems.length})`
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
                  onChange={({ detail }) => { setFilterText(detail.filteringText); }}
                  filteringPlaceholder="Search within page..."
                  countText={`${displayedItems.length} matches`}
                />
                <Select
                  selectedOption={typeFilter}
                  onChange={({ detail }) => {
                    setTypeFilter(detail.selectedOption.value ? (detail.selectedOption as any) : null);
                    resetPagination();
                  }}
                  options={[{ label: 'All types', value: '' }, ...typeOptions]}
                  placeholder="All types"
                />
                <ProjectSelect
                  selectedOption={projectFilter}
                  onChange={(opt) => { setProjectFilter(opt); resetPagination(); }}
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
            items={displayedItems}
            loading={loading}
            loadingText="Loading thoughts..."
            sortingDisabled={false}
            stickyHeader
            pagination={
              <SpaceBetween direction="horizontal" size="xs">
                <Button disabled={currentPage <= 1} onClick={handlePreviousPage}>Previous</Button>
                <Box variant="p" padding={{ top: 'xxs' }}>Page {currentPage}</Box>
                <Button disabled={!hasMore} onClick={handleNextPage}>Next</Button>
              </SpaceBetween>
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
                  resetPagination();
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
