import { NormalizedConversation, Chunk } from './types';

const MIN_CHUNK_SIZE = 30;
const MAX_RESPONSE_CHARS = 8000;

/**
 * Split a normalized conversation into exchange-pair chunks.
 * Each chunk = one user turn + the following assistant response.
 */
export function chunkConversation(conversation: NormalizedConversation): Chunk[] {
  const { messages } = conversation;
  if (messages.length < 2) return [];

  const chunks: Chunk[] = [];
  let i = 0;

  // Skip any leading assistant messages (no preceding user turn)
  while (i < messages.length && messages[i].role === 'assistant') {
    i++;
  }

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role === 'user') {
      const userTurn = msg.text;
      i++;

      // Collect the assistant response (next message if it's assistant role)
      let assistantText = '';
      if (i < messages.length && messages[i].role === 'assistant') {
        assistantText = messages[i].text;
        i++;
      } else {
        // Trailing user message with no response — skip
        continue;
      }

      // Truncate long assistant responses
      if (assistantText.length > MAX_RESPONSE_CHARS) {
        assistantText = assistantText.slice(0, MAX_RESPONSE_CHARS) + '\n[truncated]';
      }

      const content = `> ${userTurn}\n\n${assistantText}`;

      // Skip tiny chunks
      if (content.length < MIN_CHUNK_SIZE) continue;

      chunks.push({
        content,
        chunkIndex: chunks.length,
        userTurn,
      });
    } else {
      // Unexpected non-user message — skip
      i++;
    }
  }

  return chunks;
}
