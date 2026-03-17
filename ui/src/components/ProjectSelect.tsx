import { useState, useEffect } from 'react';
import Select from '@cloudscape-design/components/select';
import { api } from '../api/client';

interface ProjectSelectProps {
  selectedOption: { label: string; value: string } | null;
  onChange: (option: { label: string; value: string } | null) => void;
  placeholder?: string;
  allLabel?: string;
  disabled?: boolean;
}

let cachedProjects: string[] | null = null;

export function ProjectSelect({ selectedOption, onChange, placeholder = 'Select project', allLabel = 'All projects', disabled = false }: ProjectSelectProps) {
  const [projects, setProjects] = useState<string[]>(cachedProjects || []);
  const [loading, setLoading] = useState(!cachedProjects);

  useEffect(() => {
    if (cachedProjects) return;
    setLoading(true);
    api.getProjects().then((data) => {
      const sorted = data.projects.slice().sort();
      cachedProjects = sorted;
      setProjects(sorted);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const options = [
    { label: allLabel, value: '__all__' },
    ...projects.map((p) => ({ label: p, value: p })),
  ];

  return (
    <div style={{ minWidth: '200px' }}>
      <Select
        selectedOption={selectedOption}
        onChange={({ detail }) => {
          const opt = detail.selectedOption.value === '__all__'
            ? { label: allLabel, value: '' }
            : (detail.selectedOption as { label: string; value: string });
          onChange(opt);
        }}
        options={options}
        placeholder={loading ? 'Loading...' : placeholder}
        loadingText="Loading projects..."
        statusType={loading ? 'loading' : 'finished'}
        disabled={loading || disabled}
        expandToViewport
      />
    </div>
  );
}
