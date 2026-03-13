import { useState } from 'react';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { subDays, subYears, format } from 'date-fns';

interface TimeRange {
  startDate: string;
  endDate: string;
}

interface TimeRangeSelectorProps {
  onChange: (range: TimeRange) => void;
  defaultRange?: string;
}

const STORAGE_KEY = 'dashboard-time-range';

const PRESETS: Record<string, () => TimeRange> = {
  '1d': () => ({ startDate: format(subDays(new Date(), 1), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }),
  '7d': () => ({ startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }),
  '30d': () => ({ startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }),
  '90d': () => ({ startDate: format(subDays(new Date(), 90), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }),
  '1y': () => ({ startDate: format(subYears(new Date(), 1), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }),
};

export function getSavedTimeRange(): { key: string; range: TimeRange } {
  const saved = localStorage.getItem(STORAGE_KEY);
  const key = saved && saved in PRESETS ? saved : '7d';
  return { key, range: PRESETS[key]() };
}

export function TimeRangeSelector({ onChange, defaultRange = '7d' }: TimeRangeSelectorProps) {
  const [selected, setSelected] = useState(defaultRange);

  const handleClick = (key: string) => {
    const range = PRESETS[key];
    if (range) {
      setSelected(key);
      localStorage.setItem(STORAGE_KEY, key);
      onChange(range());
    }
  };

  return (
    <SpaceBetween direction="horizontal" size="xs">
      {Object.keys(PRESETS).map((key) => (
        <Button
          key={key}
          variant={selected === key ? 'primary' : 'normal'}
          onClick={() => handleClick(key)}
        >
          {key}
        </Button>
      ))}
    </SpaceBetween>
  );
}
