import { useState } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Button from '@cloudscape-design/components/button';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import Modal from '@cloudscape-design/components/modal';
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
  const [selectedItems, setSelectedItems] = useState<SearchResult[]>([]);
  const [detailVisible, setDetailVisible] = useState(false);

  // Client-side filters
  const [filterText, setFilterText] = useState('');
  const [typeFilter, setTypeFilter] = useState<{ label: string; value: string } | null>(null);
  const [projectFilter, setProjectFilter] = useState<{ label: string; value: string } | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setHasSearched(true);
    setSelectedItems([]);
    setFilterText('');
    setTypeFilter(null);
    setProjectFilter(null);
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

  const typeOptions = [
    ...VALID_THOUGHT_TYPES.map((t) => ({ label: t, value: t })),
    { label: 'pending', value: 'pending' },
  ];

  const formatMatch = (distance: number) => {
    const pct = Math.round((1 - distance) * 100);
    return `${pct}%`;
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
                <Header
                  counter={`(${filteredResults.length})`}
                  actions={
                    <Button disabled={selectedItems.length !== 1} onClick={() => setDetailVisible(true)}>
                      View
                    </Button>
                  }
                >
                  Results
                </Header>
              }
              filter={
                <SpaceBetween direction="horizontal" size="xs">
                  <TextFilter
                    filteringText={filterText}
                    onChange={({ detail }) => setFilterText(detail.filteringText)}
                    filteringPlaceholder="Filter results..."
                    countText={`${filteredResults.length} matches`}
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
                  id: 'match',
                  header: 'Match',
                  cell: (item) => (
                    <Box color="text-status-success" fontWeight="bold">
                      {formatMatch(item.distance)}
                    </Box>
                  ),
                  width: 80,
                },
                {
                  id: 'type',
                  header: 'Type',
                  cell: (item) => <ThoughtTypeBadge type={item.metadata.type} />,
                  width: 140,
                },
                {
                  id: 'summary',
                  header: 'Summary',
                  cell: (item) => {
                    const text = item.metadata.summary || item.metadata.content || '';
                    return text.length > 100 ? text.substring(0, 100) + '...' : text;
                  },
                  maxWidth: 400,
                },
                {
                  id: 'project',
                  header: 'Project',
                  cell: (item) => item.metadata.project || '-',
                  width: 150,
                },
                {
                  id: 'source',
                  header: 'Source',
                  cell: (item) => item.metadata.source,
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
                  width: 120,
                },
              ]}
              items={filteredResults}
              loading={loading}
              loadingText="Searching..."
              stickyHeader
              empty={
                <Box textAlign="center" color="inherit">
                  <b>No results</b>
                  <Box padding={{ bottom: 's' }} variant="p" color="inherit">
                    No thoughts matched your query.
                  </Box>
                </Box>
              }
              onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
              selectedItems={selectedItems}
              selectionType="single"
            />
          )}
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
            <Button variant="link" onClick={() => setDetailVisible(false)}>
              Close
            </Button>
          </Box>
        }
      >
        {selectedItems.length === 1 && (
          <ThoughtDetail
            thought={{ key: selectedItems[0].key, metadata: selectedItems[0].metadata }}
            editing={false}
            onSave={async () => {}}
            onCancel={() => setDetailVisible(false)}
          />
        )}
      </Modal>
    </>
  );
}
