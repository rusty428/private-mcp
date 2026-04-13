// scripts/lib/normalizer.ts
import { NormalizedConversation, NormalizedMessage } from './types';

/**
 * Parse Claude Code session JSONL into a normalized conversation.
 *
 * Claude Code JSONL entries have a `type` field. We extract:
 * - type="user" with string message.content → user turns
 * - type="assistant" with content block arrays → assistant turns (text blocks only)
 * - type="custom-title" → session name
 *
 * Multiple assistant entries share the same message.id (streaming).
 * We aggregate text blocks per message.id and filter out empty results.
 */
export function parseClaudeCode(
  content: string,
  filePath: string,
): NormalizedConversation[] {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  // Metadata
  let sessionId: string | undefined;
  let sessionName: string | undefined;
  let firstTimestamp: string | undefined;
  let cwd: string | undefined;

  // Aggregate assistant text blocks by message.id
  const assistantTextByMsgId = new Map<string, string[]>();

  // Track ordered sequence of conversation entries
  type SeqEntry =
    | { kind: 'user'; text: string }
    | { kind: 'assistant-ref'; msgId: string };
  const sequence: SeqEntry[] = [];

  for (const line of lines) {
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    // Extract metadata from any entry
    if (!sessionId && entry.sessionId) sessionId = entry.sessionId;
    if (!sessionName && entry.type === 'custom-title') {
      sessionName = entry.customTitle;
    }
    if (!firstTimestamp && entry.timestamp) firstTimestamp = entry.timestamp;
    if (!cwd && entry.cwd) cwd = entry.cwd;

    // User message — only string content (skip tool_result arrays)
    if (entry.type === 'user' && typeof entry.message?.content === 'string') {
      sequence.push({ kind: 'user', text: entry.message.content });
      continue;
    }

    // Assistant message — extract text blocks, aggregate by message.id
    if (
      entry.type === 'assistant' &&
      Array.isArray(entry.message?.content)
    ) {
      const msgId: string | undefined = entry.message.id;
      if (!msgId) continue;

      const textBlocks: string[] = entry.message.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => (b.text || '').trim())
        .filter((t: string) => t.length > 0);

      if (textBlocks.length > 0) {
        if (!assistantTextByMsgId.has(msgId)) {
          assistantTextByMsgId.set(msgId, []);
          sequence.push({ kind: 'assistant-ref', msgId });
        }
        assistantTextByMsgId.get(msgId)!.push(...textBlocks);
      }
    }
  }

  // Resolve sequence into messages
  const messages: NormalizedMessage[] = [];
  for (const item of sequence) {
    if (item.kind === 'user') {
      messages.push({ role: 'user', text: item.text });
    } else {
      const texts = assistantTextByMsgId.get(item.msgId);
      const joined = texts?.join('\n').trim();
      if (joined) {
        messages.push({ role: 'assistant', text: joined });
      }
    }
  }

  // Merge consecutive same-role messages
  const merged: NormalizedMessage[] = [];
  for (const msg of messages) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1] = {
        role: msg.role,
        text: merged[merged.length - 1].text + '\n' + msg.text,
      };
    } else {
      merged.push({ role: msg.role, text: msg.text });
    }
  }

  // Need at least 2 messages to form a conversation
  if (merged.length < 2) return [];

  // Extract project from cwd (last path segment)
  const project = cwd ? cwd.split('/').pop() : undefined;

  // Extract session date from first timestamp
  const sessionDate = firstTimestamp ? firstTimestamp.slice(0, 10) : undefined;

  return [
    {
      messages: merged,
      sourceFile: filePath,
      format: 'claude-code',
      sessionDate,
      sessionId,
      sessionName,
      project,
    },
  ];
}
