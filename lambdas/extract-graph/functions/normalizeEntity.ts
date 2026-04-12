export function normalizeEntityId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/'/g, '')
    .replace(/\s+/g, '-');
}
