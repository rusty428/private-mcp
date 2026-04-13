// scripts/lib/__tests__/normalizer.test.ts
import { parseClaudeCode } from '../normalizer';

const MINIMAL_SESSION = [
  '{"type":"custom-title","customTitle":"Fix auth bug","sessionId":"abc-123"}',
  '{"type":"user","message":{"role":"user","content":"fix the auth bug"},"timestamp":"2026-01-15T10:00:00Z","cwd":"/Users/dev/workspace/myproject","sessionId":"abc-123"}',
  '{"type":"assistant","message":{"id":"msg_1","role":"assistant","content":[{"type":"text","text":"I\'ll look at the auth module and fix the bug."}]},"timestamp":"2026-01-15T10:00:05Z","sessionId":"abc-123"}',
  '{"type":"user","message":{"role":"user","content":"looks good, thanks"},"timestamp":"2026-01-15T10:01:00Z","sessionId":"abc-123"}',
  '{"type":"assistant","message":{"id":"msg_2","role":"assistant","content":[{"type":"text","text":"You\'re welcome!"}]},"timestamp":"2026-01-15T10:01:05Z","sessionId":"abc-123"}',
].join('\n');

const SESSION_WITH_TOOLS = [
  '{"type":"user","message":{"role":"user","content":"check the config"},"timestamp":"2026-01-15T10:00:00Z","cwd":"/Users/dev/workspace/myproject","sessionId":"abc-123"}',
  '{"type":"assistant","message":{"id":"msg_1","role":"assistant","content":[{"type":"text","text":"\\n\\n"}]},"timestamp":"2026-01-15T10:00:02Z","sessionId":"abc-123"}',
  '{"type":"assistant","message":{"id":"msg_1","role":"assistant","content":[{"type":"thinking","thinking":"Let me read the config file"}]},"timestamp":"2026-01-15T10:00:03Z","sessionId":"abc-123"}',
  '{"type":"assistant","message":{"id":"msg_1","role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/config.ts"}}]},"timestamp":"2026-01-15T10:00:04Z","sessionId":"abc-123"}',
  '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"config data"}]},"timestamp":"2026-01-15T10:00:05Z","sessionId":"abc-123"}',
  '{"type":"assistant","message":{"id":"msg_2","role":"assistant","content":[{"type":"text","text":"The config looks correct. No issues found."}]},"timestamp":"2026-01-15T10:00:10Z","sessionId":"abc-123"}',
].join('\n');

const METADATA_ONLY = [
  '{"type":"custom-title","customTitle":"test"}',
  '{"type":"agent-name","agentName":"test"}',
  '{"type":"permission-mode","permissionMode":"default"}',
].join('\n');

describe('parseClaudeCode', () => {
  it('parses a minimal conversation', () => {
    const results = parseClaudeCode(MINIMAL_SESSION, '/path/to/session.jsonl');
    expect(results).toHaveLength(1);
    const conv = results[0];
    expect(conv.messages).toHaveLength(4);
    expect(conv.messages[0]).toEqual({ role: 'user', text: 'fix the auth bug' });
    expect(conv.messages[1]).toEqual({
      role: 'assistant',
      text: "I'll look at the auth module and fix the bug.",
    });
    expect(conv.messages[2]).toEqual({ role: 'user', text: 'looks good, thanks' });
    expect(conv.messages[3]).toEqual({ role: 'assistant', text: "You're welcome!" });
  });

  it('extracts session metadata', () => {
    const results = parseClaudeCode(MINIMAL_SESSION, '/path/to/session.jsonl');
    const conv = results[0];
    expect(conv.format).toBe('claude-code');
    expect(conv.sourceFile).toBe('/path/to/session.jsonl');
    expect(conv.sessionName).toBe('Fix auth bug');
    expect(conv.sessionId).toBe('abc-123');
    expect(conv.sessionDate).toBe('2026-01-15');
    expect(conv.project).toBe('myproject');
  });

  it('filters out thinking, tool_use, and tool_result entries', () => {
    const results = parseClaudeCode(SESSION_WITH_TOOLS, '/path/to/session.jsonl');
    expect(results).toHaveLength(1);
    const conv = results[0];
    expect(conv.messages).toHaveLength(2);
    expect(conv.messages[0]).toEqual({ role: 'user', text: 'check the config' });
    expect(conv.messages[1]).toEqual({
      role: 'assistant',
      text: 'The config looks correct. No issues found.',
    });
  });

  it('returns empty array for non-conversation content', () => {
    expect(parseClaudeCode(METADATA_ONLY, '/path/to/session.jsonl')).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(parseClaudeCode('', '/path/to/session.jsonl')).toEqual([]);
  });

  it('skips invalid JSON lines gracefully', () => {
    const withBadLine = MINIMAL_SESSION + '\n{invalid json}';
    const results = parseClaudeCode(withBadLine, '/path/to/session.jsonl');
    expect(results).toHaveLength(1);
    expect(results[0].messages).toHaveLength(4);
  });

  it('merges consecutive assistant messages from different message IDs', () => {
    const session = [
      '{"type":"user","message":{"role":"user","content":"explain this"},"timestamp":"2026-01-15T10:00:00Z","sessionId":"abc-123"}',
      '{"type":"assistant","message":{"id":"msg_1","role":"assistant","content":[{"type":"text","text":"First part."}]},"timestamp":"2026-01-15T10:00:02Z","sessionId":"abc-123"}',
      '{"type":"assistant","message":{"id":"msg_2","role":"assistant","content":[{"type":"text","text":"Second part."}]},"timestamp":"2026-01-15T10:00:04Z","sessionId":"abc-123"}',
    ].join('\n');
    const results = parseClaudeCode(session, '/path/to/session.jsonl');
    expect(results[0].messages).toHaveLength(2);
    expect(results[0].messages[1]).toEqual({
      role: 'assistant',
      text: 'First part.\nSecond part.',
    });
  });

  it('aggregates text blocks across entries with same message.id', () => {
    const session = [
      '{"type":"user","message":{"role":"user","content":"hello"},"timestamp":"2026-01-15T10:00:00Z","sessionId":"abc-123"}',
      '{"type":"assistant","message":{"id":"msg_1","role":"assistant","content":[{"type":"text","text":"\\n\\n"}]},"timestamp":"2026-01-15T10:00:02Z","sessionId":"abc-123"}',
      '{"type":"assistant","message":{"id":"msg_1","role":"assistant","content":[{"type":"thinking","thinking":"reasoning"}]},"timestamp":"2026-01-15T10:00:03Z","sessionId":"abc-123"}',
      '{"type":"assistant","message":{"id":"msg_1","role":"assistant","content":[{"type":"text","text":"Actual response."}]},"timestamp":"2026-01-15T10:00:04Z","sessionId":"abc-123"}',
    ].join('\n');
    const results = parseClaudeCode(session, '/path/to/session.jsonl');
    expect(results[0].messages).toHaveLength(2);
    expect(results[0].messages[1]).toEqual({
      role: 'assistant',
      text: 'Actual response.',
    });
  });
});
