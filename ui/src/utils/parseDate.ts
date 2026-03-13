/**
 * Parse a date string safely, handling date-only strings (YYYY-MM-DD) as local time.
 * JavaScript's new Date('2026-03-13') parses as UTC midnight, which shifts to the
 * previous day when displayed in timezones west of UTC. Appending T00:00:00 forces
 * local time parsing.
 */
export function parseLocalDate(raw: string): Date {
  if (raw.length === 10 && raw[4] === '-' && raw[7] === '-') {
    return new Date(raw + 'T00:00:00');
  }
  return new Date(raw);
}
