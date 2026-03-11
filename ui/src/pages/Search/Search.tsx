import { useState } from 'react';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Button from '@cloudscape-design/components/button';
import Select, { type SelectProps } from '@cloudscape-design/components/select';
import Spinner from '@cloudscape-design/components/spinner';
import Box from '@cloudscape-design/components/box';
import { api } from '../../api/client';
import type { SearchResult } from '../../api/types';
import { SearchResultCard } from './SearchResultCard';

export function Search() {
  console.log('Search component mounting');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Filter state
  const [selectedType, setSelectedType] = useState<SelectProps.Option | null>(null);
  const [projectFilter, setProjectFilter] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);
    try {
      const searchResults = await api.search({ query: query.trim(), limit: 50 });
      console.log('RAW SEARCH API RESPONSE:', JSON.stringify(searchResults, null, 2));
      setResults(searchResults);
      setFilteredResults(searchResults);
      // Reset filters
      setSelectedType(null);
      setProjectFilter('');
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setFilteredResults([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...results];

    if (selectedType) {
      filtered = filtered.filter((r) => r.metadata.type === selectedType.value);
    }

    if (projectFilter.trim()) {
      const projectLower = projectFilter.toLowerCase();
      filtered = filtered.filter((r) =>
        r.metadata.project?.toLowerCase().includes(projectLower)
      );
    }

    setFilteredResults(filtered);
  };

  const typeOptions = [
    { label: 'All Types', value: '' },
    { label: 'Decision', value: 'decision' },
    { label: 'Observation', value: 'observation' },
    { label: 'Task', value: 'task' },
    { label: 'Idea', value: 'idea' },
    { label: 'Reference', value: 'reference' },
    { label: 'Person Note', value: 'person_note' },
    { label: 'Project Summary', value: 'project_summary' },
    { label: 'Milestone', value: 'milestone' },
  ];

  return (
    <SpaceBetween size="l">
      <Header variant="h1">Semantic Search</Header>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.detail.value)}
            placeholder="Search thoughts by meaning..."
            onKeyDown={(e) => {
              if (e.detail.key === 'Enter') {
                handleSearch();
              }
            }}
          />
        </div>
        <Button variant="primary" onClick={handleSearch} loading={loading}>
          Search
        </Button>
      </div>

      {results.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Select
              selectedOption={selectedType}
              onChange={(e) => {
                setSelectedType(e.detail.selectedOption);
                setTimeout(applyFilters, 0);
              }}
              options={typeOptions}
              placeholder="Filter by type"
              expandToViewport
            />
          </div>
          <div style={{ flex: 1 }}>
            <Input
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.detail.value);
                setTimeout(applyFilters, 0);
              }}
              placeholder="Filter by project"
            />
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spinner size="large" />
        </div>
      )}

      {!loading && hasSearched && filteredResults.length === 0 && (
        <Box textAlign="center" color="text-status-inactive" padding="xxl">
          No results found
        </Box>
      )}

      {!loading && filteredResults.length > 0 && (
        <SpaceBetween size="s">
          <Box variant="p" color="text-status-inactive">
            {filteredResults.length} result{filteredResults.length === 1 ? '' : 's'}
            {filteredResults.length !== results.length &&
              ` (filtered from ${results.length} total)`}
          </Box>
          {filteredResults.map((result) => (
            <SearchResultCard key={result.key} result={result} />
          ))}
        </SpaceBetween>
      )}

      {!loading && !hasSearched && (
        <Box textAlign="center" color="text-status-inactive" padding="xxl">
          Enter a search query to find thoughts by semantic meaning
        </Box>
      )}
    </SpaceBetween>
  );
}
