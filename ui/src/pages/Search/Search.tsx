import { useState } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Button from '@cloudscape-design/components/button';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import Icon from '@cloudscape-design/components/icon';
import Modal from '@cloudscape-design/components/modal';
import Pagination from '@cloudscape-design/components/pagination';
import CollectionPreferences from '@cloudscape-design/components/collection-preferences';
import TextFilter from '@cloudscape-design/components/text-filter';
import Select from '@cloudscape-design/components/select';
import { ThoughtTypeBadge } from '../../components/ThoughtTypeBadge';
import { ProjectSelect } from '../../components/ProjectSelect';
import { ThoughtDetail } from '../Browse/ThoughtDetail';
import { api } from '../../api/client';
import type { SearchResult } from '../../api/types';
import { VALID_THOUGHT_TYPES } from '@shared-types/thought';

export function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [detailItem, setDetailItem] = useState<SearchResult | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Client-side filters
  const [filterText, setFilterText] = useState('');
  const [typeFilter, setTypeFilter] = useState<{ label: string; value: string } | null>(null);
  const [projectFilter, setProjectFilter] = useState<{ label: string; value: string } | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setHasSearched(true);
    setFilterText('');
    setTypeFilter(null);
    setProjectFilter(null);
    setCurrentPage(1);
    try {
      const searchResults = await api.search({ query: query.trim(), limit: 100 });
      setResults(searchResults);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredResults = results.filter((r) => {
    if (typeFilter && r.metadata.type !== typeFilter.value) return false;
    if (projectFilter && r.metadata.project !== projectFilter.value) return false;
    if (filterText) {
      const text = filterText.toLowerCase();
      const summary = (r.metadata.summary || '').toLowerCase();
      const content = (r.metadata.content || '').toLowerCase();
      const project = (r.metadata.project || '').toLowerCase();
      if (!summary.includes(text) && !content.includes(text) && !project.includes(text)) return false;
    }
    return true;
  });

  const pageCount = Math.ceil(filteredResults.length / pageSize);
  const paginatedResults = filteredResults.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const typeOptions = [
    ...VALID_THOUGHT_TYPES.map((t) => ({ label: t, value: t })),
    { label: 'pending', value: 'pending' },
  ];

  const formatMatch = (distance: number) => {
    const pct = Math.round((1 - distance) * 100);
    return `${pct}%`;
  };

  const openDetail = (item: SearchResult) => {
    setDetailItem(item);
    setDetailVisible(true);
  };

  return (
    <>
      <ContentLayout
        header={<Header variant="h1">Semantic Search</Header>}
      >
        <SpaceBetween size="l">
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <Input
                value={query}
                onChange={({ detail }) => setQuery(detail.value)}
                placeholder="Search thoughts by meaning..."
                onKeyDown={({ detail }) => {
                  if (detail.key === 'Enter') handleSearch();
                }}
              />
            </div>
            <Button variant="primary" onClick={handleSearch} loading={loading}>
              Search
            </Button>
          </div>

          {!hasSearched && !loading && (
            <Box textAlign="center" color="text-status-inactive" padding="xxl">
              Enter a natural language query to find thoughts by semantic meaning
            </Box>
          )}

          {hasSearched && (
            <Table
              header={
                <Header counter={`(${filteredResults.length})`}>
                  Results
                </Header>
              }
              filter={
                <SpaceBetween direction="horizontal" size="xs">
                  <TextFilter
                    filteringText={filterText}
                    onChange={({ detail }) => { setFilterText(detail.filteringText); setCurrentPage(1); }}
                    filteringPlaceholder="Filter results..."
                    countText={`${filteredResults.length} matches`}
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
                  id: 'match',
                  header: 'Match',
                  cell: (item) => (
                    <div style={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                      <Box color="text-status-success" fontWeight="bold">
                        {formatMatch(item.distance)}
                      </Box>
                    </div>
                  ),
                  width: 80,
                },
                {
                  id: 'type',
                  header: 'Type',
                  cell: (item) => (
                    <div style={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                      <ThoughtTypeBadge type={item.metadata.type} />
                    </div>
                  ),
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
                  width: 120,
                },
                {
                  id: 'date',
                  header: 'Date',
                  cell: (item) => {
                    const raw = item.metadata.thought_date || item.metadata.created_at || '';
                    const d = new Date(raw);
                    return (
                      <div style={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                        {isNaN(d.getTime()) ? '-' : d.toLocaleDateString()}
                      </div>
                    );
                  },
                  width: 120,
                },
                {
                  id: 'actions',
                  header: '',
                  cell: (item) => (
                    <span
                      style={{ cursor: 'pointer', color: 'var(--color-text-link-default)' }}
                      onClick={() => openDetail(item)}
                      title="View details"
                    >
                      <Icon name="status-info" />
                    </span>
                  ),
                  width: 50,
                },
              ]}
              items={paginatedResults}
              loading={loading}
              loadingText="Searching..."
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
                      { value: 10, label: '10 results' },
                      { value: 25, label: '25 results' },
                      { value: 50, label: '50 results' },
                      { value: 100, label: '100 results' },
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
                  <b>No results</b>
                  <Box padding={{ bottom: 's' }} variant="p" color="inherit">
                    No thoughts matched your query.
                  </Box>
                </Box>
              }
            />
          )}
        </SpaceBetween>
      </ContentLayout>

      <Modal
        visible={detailVisible && detailItem !== null}
        onDismiss={() => setDetailVisible(false)}
        header="Thought Details"
        closeAriaLabel="Close details"
        size="large"
        footer={
          <Box float="right">
            <Button variant="primary" onClick={() => setDetailVisible(false)}>
              Close
            </Button>
          </Box>
        }
      >
        {detailItem && (
          <ThoughtDetail thought={{ key: detailItem.key, metadata: detailItem.metadata }} />
        )}
      </Modal>
    </>
  );
}
