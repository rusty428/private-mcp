import { ThoughtQuality, ThoughtSource } from '../../../types/thought';

const URL_REGEX = /^https?:\/\/\S+$/;
const SLASH_CMD_REGEX = /^\//;

export function triageThought(text: string, source: ThoughtSource): ThoughtQuality {
  const trimmed = text.trim();
  if (URL_REGEX.test(trimmed)) return 'noise';
  if (SLASH_CMD_REGEX.test(trimmed)) return 'noise';
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 10) return 'noise';
  if (source === 'user-prompt' && wordCount < 15) return 'noise';
  return 'standard';
}
