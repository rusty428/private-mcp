import { NormalizedConversation, Chunk } from './types';

const MIN_CHUNK_SIZE = 30;
const MAX_CONTENT_CHARS = 9500; // Stay under 10000 API limit with margin for formatting
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

      // Truncate user turn if needed (rare — huge pasted code blocks)
      let displayUserTurn = userTurn;
      if (displayUserTurn.length > 1500) {
        displayUserTurn = displayUserTurn.slice(0, 1500) + '\n[truncated]';
      }

      let content = `> ${displayUserTurn}\n\n${assistantText}`;

      // Final safety cap — ensure total stays under API limit
      if (content.length > MAX_CONTENT_CHARS) {
        content = content.slice(0, MAX_CONTENT_CHARS - 12) + '\n[truncated]';
      }

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
