export function stripFraming(text: string, source: string): string {
  const userPromptMatch = text.match(/^User prompt in \S+:\s*(.+)$/s);
  if (userPromptMatch && source === 'user-prompt') {
    return userPromptMatch[1].trim();
  }
  return text;
}
