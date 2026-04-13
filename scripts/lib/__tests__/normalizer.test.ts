// scripts/lib/__tests__/normalizer.test.ts
import { parseClaudeCode, parseChatGPT, parseClaudeAI } from '../normalizer';

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

const CHATGPT_SINGLE = JSON.stringify({
  title: 'TypeScript Help',
  create_time: 1705305600, // 2024-01-15
  mapping: {
    root: {
      parent: null,
      children: ['user1'],
      message: null,
    },
    user1: {
      parent: 'root',
      children: ['asst1'],
      message: {
        author: { role: 'user' },
        content: { parts: ['What is TypeScript?'] },
      },
    },
    asst1: {
      parent: 'user1',
      children: ['user2'],
      message: {
        author: { role: 'assistant' },
        content: { parts: ['TypeScript is a typed superset of JavaScript.'] },
      },
    },
    user2: {
      parent: 'asst1',
      children: ['asst2'],
      message: {
        author: { role: 'user' },
        content: { parts: ['How do I install it?'] },
      },
    },
    asst2: {
      parent: 'user2',
      children: [],
      message: {
        author: { role: 'assistant' },
        content: { parts: ['Run npm install -g typescript.'] },
      },
    },
  },
});

const CHATGPT_ARRAY = JSON.stringify([
  JSON.parse(CHATGPT_SINGLE),
  {
    title: 'Python Help',
    create_time: 1705392000,
    mapping: {
      root: { parent: null, children: ['u1'], message: null },
      u1: {
        parent: 'root',
        children: ['a1'],
        message: {
          author: { role: 'user' },
          content: { parts: ['What is Python?'] },
        },
      },
      a1: {
        parent: 'u1',
        children: [],
        message: {
          author: { role: 'assistant' },
          content: { parts: ['Python is a high-level programming language.'] },
        },
      },
    },
  },
]);

describe('parseChatGPT', () => {
  it('parses a single conversation object', () => {
    const results = parseChatGPT(CHATGPT_SINGLE, '/export/conversations.json');
    expect(results).toHaveLength(1);
    expect(results[0].messages).toHaveLength(4);
    expect(results[0].messages[0]).toEqual({ role: 'user', text: 'What is TypeScript?' });
    expect(results[0].messages[1]).toEqual({
      role: 'assistant',
      text: 'TypeScript is a typed superset of JavaScript.',
    });
    expect(results[0].format).toBe('chatgpt');
    expect(results[0].sessionName).toBe('TypeScript Help');
    expect(results[0].sessionDate).toBe('2024-01-15');
  });

  it('parses an array of conversations', () => {
    const results = parseChatGPT(CHATGPT_ARRAY, '/export/conversations.json');
    expect(results).toHaveLength(2);
    expect(results[0].sessionName).toBe('TypeScript Help');
    expect(results[1].sessionName).toBe('Python Help');
    expect(results[1].messages[0]).toEqual({ role: 'user', text: 'What is Python?' });
  });

  it('skips system messages', () => {
    const conv = JSON.stringify({
      title: 'Test',
      create_time: 1705305600,
      mapping: {
        root: { parent: null, children: ['sys'], message: null },
        sys: {
          parent: 'root',
          children: ['u1'],
          message: { author: { role: 'system' }, content: { parts: ['You are helpful.'] } },
        },
        u1: {
          parent: 'sys',
          children: ['a1'],
          message: { author: { role: 'user' }, content: { parts: ['Hello'] } },
        },
        a1: {
          parent: 'u1',
          children: [],
          message: { author: { role: 'assistant' }, content: { parts: ['Hi!'] } },
        },
      },
    });
    const results = parseChatGPT(conv, '/test.json');
    expect(results[0].messages).toHaveLength(2);
  });

  it('returns empty for invalid JSON', () => {
    expect(parseChatGPT('not json', '/test.json')).toEqual([]);
  });
});

const CLAUDE_AI_FLAT = JSON.stringify([
  { role: 'user', content: 'What is CDK?' },
  { role: 'assistant', content: 'CDK is the AWS Cloud Development Kit.' },
  { role: 'user', content: 'How do I deploy?' },
  { role: 'assistant', content: 'Run cdk deploy from your project root.' },
]);

const CLAUDE_AI_PRIVACY = JSON.stringify([
  {
    name: 'CDK Chat',
    created_at: '2026-01-15T10:00:00Z',
    chat_messages: [
      { role: 'human', content: 'What is CDK?' },
      { role: 'assistant', content: 'CDK is the AWS Cloud Development Kit.' },
    ],
  },
  {
    name: 'Lambda Chat',
    created_at: '2026-01-16T10:00:00Z',
    chat_messages: [
      { role: 'human', content: 'What is Lambda?' },
      { role: 'assistant', content: 'Lambda is serverless compute on AWS.' },
    ],
  },
]);

const CLAUDE_AI_MESSAGES_KEY = JSON.stringify({
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
  ],
});

describe('parseClaudeAI', () => {
  it('parses flat message array', () => {
    const results = parseClaudeAI(CLAUDE_AI_FLAT, '/export/chat.json');
    expect(results).toHaveLength(1);
    expect(results[0].messages).toHaveLength(4);
    expect(results[0].messages[0]).toEqual({ role: 'user', text: 'What is CDK?' });
    expect(results[0].format).toBe('claude-ai');
  });

  it('parses privacy export with multiple conversations', () => {
    const results = parseClaudeAI(CLAUDE_AI_PRIVACY, '/export/conversations.json');
    expect(results).toHaveLength(2);
    expect(results[0].sessionName).toBe('CDK Chat');
    expect(results[0].sessionDate).toBe('2026-01-15');
    expect(results[1].sessionName).toBe('Lambda Chat');
    expect(results[1].messages[0]).toEqual({ role: 'user', text: 'What is Lambda?' });
  });

  it('parses object with messages key', () => {
    const results = parseClaudeAI(CLAUDE_AI_MESSAGES_KEY, '/export/chat.json');
    expect(results).toHaveLength(1);
    expect(results[0].messages).toHaveLength(2);
  });

  it('maps human role to user', () => {
    const results = parseClaudeAI(CLAUDE_AI_PRIVACY, '/export/conversations.json');
    expect(results[0].messages[0].role).toBe('user');
  });

  it('returns empty for invalid JSON', () => {
    expect(parseClaudeAI('not json', '/test.json')).toEqual([]);
  });
});
