import { useState, useEffect, useRef } from 'react';
import Select from '@cloudscape-design/components/select';
import { api } from '../api/client';
import { useDemoMode } from '../contexts/DemoContext';

interface ProjectSelectProps {
  selectedOption: { label: string; value: string } | null;
  onChange: (option: { label: string; value: string } | null) => void;
  placeholder?: string;
  allLabel?: string;
  disabled?: boolean;
}

let cachedProjects: string[] | null = null;
let cachedForDemo: boolean | null = null;

export function ProjectSelect({ selectedOption, onChange, placeholder = 'Select project', allLabel = 'All projects', disabled = false }: ProjectSelectProps) {
  const { isDemoMode } = useDemoMode();
  const [projects, setProjects] = useState<string[]>(cachedProjects && cachedForDemo === isDemoMode ? cachedProjects : []);
  const [loading, setLoading] = useState(!(cachedProjects && cachedForDemo === isDemoMode));
  const prevDemo = useRef(isDemoMode);

  useEffect(() => {
    if (prevDemo.current !== isDemoMode) {
      cachedProjects = null;
      cachedForDemo = null;
      prevDemo.current = isDemoMode;
    }
    if (cachedProjects && cachedForDemo === isDemoMode) return;
    setLoading(true);
    api.getProjects().then((data) => {
      const sorted = data.projects.slice().sort();
      cachedProjects = sorted;
      cachedForDemo = isDemoMode;
      setProjects(sorted);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [isDemoMode]);

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
