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

const PRESETS: Record<string, () => TimeRange> = {
  '1d': () => ({ startDate: format(subDays(new Date(), 1), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }),
  '7d': () => ({ startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }),
  '30d': () => ({ startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }),
  '90d': () => ({ startDate: format(subDays(new Date(), 90), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }),
  '1y': () => ({ startDate: format(subYears(new Date(), 1), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }),
};

export function TimeRangeSelector({ onChange, defaultRange = '30d' }: TimeRangeSelectorProps) {
  const [selected, setSelected] = useState(defaultRange);

  const handleClick = (key: string) => {
    const range = PRESETS[key];
    if (range) {
      setSelected(key);
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
