// All demo JSON files use this anchor. Data spans anchor-7d through anchor.
export const DEMO_ANCHOR = '2026-01-08';

function getOffsetMs(): number {
  const anchor = new Date(DEMO_ANCHOR + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime() - anchor.getTime();
}

/** Shift a YYYY-MM-DD date string forward by the offset. */
export function shiftDate(dateStr: string): string {
  if (!dateStr) return dateStr;
  const offsetMs = getOffsetMs();
  // Handle both YYYY-MM-DD and ISO datetime strings
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  d.setTime(d.getTime() + offsetMs);
  if (dateStr.includes('T')) return d.toISOString();
  return d.toISOString().slice(0, 10);
}

/** Shift all date fields in a thought record. */
export function shiftThoughtDates<T extends Record<string, any>>(item: T): T {
  return {
    ...item,
    metadata: {
      ...item.metadata,
      thought_date: shiftDate(item.metadata.thought_date),
      created_at: shiftDate(item.metadata.created_at),
    },
  };
}

/** Shift all date fields in a timeseries response. */
export function shiftTimeSeriesDates<T extends Record<string, any>>(data: T): T {
  return {
    ...data,
    buckets: data.buckets.map((b: any) => ({ ...b, date: shiftDate(b.date) })),
  };
}
