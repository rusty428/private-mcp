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

/**
 * Parse ChatGPT conversations.json export.
 * Handles both a single conversation object and an array of conversations.
 * Tree-walking: start at root (parent=null, message=null), follow children[0].
 */
export function parseChatGPT(
  content: string,
  filePath: string,
): NormalizedConversation[] {
  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }

  // Wrap single conversation in array
  const conversations: any[] = Array.isArray(data)
    ? data
    : data.mapping
      ? [data]
      : [];

  const results: NormalizedConversation[] = [];

  for (const conv of conversations) {
    const mapping = conv.mapping;
    if (!mapping || typeof mapping !== 'object') continue;

    // Find root node: parent=null and message=null (synthetic root)
    let rootId: string | null = null;
    let fallbackRoot: string | null = null;

    for (const [nodeId, node] of Object.entries(mapping) as any[]) {
      if (node.parent === null) {
        if (node.message === null || node.message === undefined) {
          rootId = nodeId;
          break;
        } else if (fallbackRoot === null) {
          fallbackRoot = nodeId;
        }
      }
    }
    if (!rootId) rootId = fallbackRoot;
    if (!rootId) continue;

    // Linear walk following children[0]
    const messages: NormalizedMessage[] = [];
    let currentId: string | null = rootId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node: any = (mapping as any)[currentId];
      if (!node) break;

      const msg = node.message;
      if (msg) {
        const role = msg.author?.role;
        const parts = msg.content?.parts;
        const text = Array.isArray(parts)
          ? parts.filter((p: any) => typeof p === 'string').join(' ').trim()
          : '';

        if (role === 'user' && text) {
          messages.push({ role: 'user', text });
        } else if (role === 'assistant' && text) {
          messages.push({ role: 'assistant', text });
        }
      }

      const children: any[] = node.children || [];
      currentId = children.length > 0 ? children[0] : null;
    }

    if (messages.length < 2) continue;

    // Extract session date from create_time (Unix timestamp)
    let sessionDate: string | undefined;
    if (conv.create_time) {
      sessionDate = new Date(conv.create_time * 1000)
        .toISOString()
        .slice(0, 10);
    }

    results.push({
      messages,
      sourceFile: filePath,
      format: 'chatgpt',
      sessionDate,
      sessionName: conv.title,
    });
  }

  return results;
}
