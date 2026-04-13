import { chunkConversation } from '../chunker';
import { NormalizedConversation } from '../types';

function makeConversation(
  messages: Array<{ role: 'user' | 'assistant'; text: string }>,
): NormalizedConversation {
  return {
    messages,
    sourceFile: '/test.jsonl',
    format: 'claude-code',
  };
}

describe('chunkConversation', () => {
  it('pairs user + assistant into exchange chunks', () => {
    const conv = makeConversation([
      { role: 'user', text: 'What is TypeScript?' },
      { role: 'assistant', text: 'TypeScript is a typed superset of JavaScript.' },
      { role: 'user', text: 'How do I install it?' },
      { role: 'assistant', text: 'Run npm install -g typescript.' },
    ]);
    const chunks = chunkConversation(conv);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].userTurn).toBe('What is TypeScript?');
    expect(chunks[0].content).toContain('What is TypeScript?');
    expect(chunks[0].content).toContain('TypeScript is a typed superset of JavaScript.');
    expect(chunks[1].chunkIndex).toBe(1);
    expect(chunks[1].userTurn).toBe('How do I install it?');
  });

  it('skips chunks under MIN_CHUNK_SIZE (30 chars)', () => {
    const conv = makeConversation([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hey' },
      { role: 'user', text: 'What is the architecture of this system?' },
      { role: 'assistant', text: 'The system uses a Lambda-based pipeline with S3 Vectors for storage.' },
    ]);
    const chunks = chunkConversation(conv);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].userTurn).toBe('What is the architecture of this system?');
  });

  it('truncates long assistant responses to MAX_RESPONSE_CHARS', () => {
    const longResponse = 'A'.repeat(9000);
    const conv = makeConversation([
      { role: 'user', text: 'Explain everything about databases.' },
      { role: 'assistant', text: longResponse },
    ]);
    const chunks = chunkConversation(conv);
    expect(chunks).toHaveLength(1);
    // Total content must be under MAX_TEXT_LENGTH (10000)
    expect(chunks[0].content.length).toBeLessThan(10000);
  });

  it('handles conversation starting with assistant (no leading user)', () => {
    const conv = makeConversation([
      { role: 'assistant', text: 'Welcome! How can I help?' },
      { role: 'user', text: 'Fix the auth bug' },
      { role: 'assistant', text: 'I will look at the auth module.' },
    ]);
    const chunks = chunkConversation(conv);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].userTurn).toBe('Fix the auth bug');
  });

  it('handles trailing user message with no assistant response', () => {
    const conv = makeConversation([
      { role: 'user', text: 'What is TypeScript?' },
      { role: 'assistant', text: 'TypeScript is a typed superset of JavaScript.' },
      { role: 'user', text: 'And what about Rust?' },
    ]);
    const chunks = chunkConversation(conv);
    expect(chunks).toHaveLength(1);
  });

  it('returns empty array for conversations with fewer than 2 messages', () => {
    const conv = makeConversation([{ role: 'user', text: 'hello' }]);
    expect(chunkConversation(conv)).toEqual([]);
  });
});
