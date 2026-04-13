/**
 * Extract text from varied content formats.
 * Handles: plain string, list of blocks/strings, dict with text key.
 * Ported from MemPalace normalize.py:267-281.
 */
export function extractContent(content: unknown): string {
  if (content == null) return '';

  if (typeof content === 'string') return content.trim();

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === 'string') {
        parts.push(item);
      } else if (
        typeof item === 'object' &&
        item !== null &&
        (item as any).type === 'text'
      ) {
        parts.push((item as any).text || '');
      }
    }
    return parts.join(' ').trim();
  }

  if (typeof content === 'object') {
    return ((content as any).text || '').trim();
  }

  return '';
}
