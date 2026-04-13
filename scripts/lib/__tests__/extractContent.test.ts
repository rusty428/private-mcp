import { extractContent } from '../extractContent';

describe('extractContent', () => {
  it('returns plain string content', () => {
    expect(extractContent('hello world')).toBe('hello world');
  });

  it('trims whitespace', () => {
    expect(extractContent('  spaced  ')).toBe('spaced');
  });

  it('extracts text from list of text blocks', () => {
    const content = [
      { type: 'text', text: 'Hello' },
      { type: 'text', text: 'world' },
    ];
    expect(extractContent(content)).toBe('Hello world');
  });

  it('extracts strings from mixed list', () => {
    const content = ['Hello', { type: 'text', text: 'world' }];
    expect(extractContent(content)).toBe('Hello world');
  });

  it('skips non-text blocks in list', () => {
    const content = [
      { type: 'text', text: 'visible' },
      { type: 'thinking', thinking: 'hidden reasoning' },
      { type: 'tool_use', id: 'x', name: 'Read', input: {} },
    ];
    expect(extractContent(content)).toBe('visible');
  });

  it('extracts text from dict with text key', () => {
    expect(extractContent({ text: 'from dict' })).toBe('from dict');
  });

  it('returns empty string for null/undefined', () => {
    expect(extractContent(null)).toBe('');
    expect(extractContent(undefined)).toBe('');
  });

  it('returns empty string for empty list', () => {
    expect(extractContent([])).toBe('');
  });
});
