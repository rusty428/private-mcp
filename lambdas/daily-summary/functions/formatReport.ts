import { ThoughtMetadata } from '../../../types/thought';

interface ThoughtWithKey {
  key: string;
  metadata: ThoughtMetadata;
}

interface DailySummaryReport {
  text: string;
  thoughtCount: number;
  dateStr: string;
}

export function formatReport(
  todayDateStr: string,
  thoughts: ThoughtWithKey[]
): DailySummaryReport {
  const count = thoughts.length;

  if (count === 0) {
    return {
      text: `*Daily Summary — ${todayDateStr}*\n\nNo thoughts captured yesterday.`,
      thoughtCount: 0,
      dateStr: todayDateStr,
    };
  }

  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const decisionsSet = new Set<string>();
  const actionItemsSet = new Set<string>();
  const milestonesSet = new Set<string>();
  const peopleSet = new Set<string>();

  for (const t of thoughts) {
    const m = t.metadata;
    byType[m.type] = (byType[m.type] || 0) + 1;
    bySource[m.source] = (bySource[m.source] || 0) + 1;

    if (m.type === 'decision') decisionsSet.add(m.summary || m.content);
    if (m.type === 'milestone') milestonesSet.add(m.summary || m.content);
    if (Array.isArray(m.action_items)) {
      for (const ai of m.action_items) actionItemsSet.add(ai);
    }
    if (Array.isArray(m.people)) {
      for (const p of m.people) peopleSet.add(p);
    }
  }

  const sourceStr = Object.entries(bySource)
    .map(([src, n]) => `${n} ${src}`)
    .join(', ');

  const typeStr = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${n} ${type}`)
    .join(', ');

  let text = `*Daily Summary — ${todayDateStr}*\n\n`;
  text += `*Performance*\n`;
  text += `• ${count} thoughts captured (${sourceStr})\n`;
  text += `• Types: ${typeStr}\n`;

  const hasHighlights = decisionsSet.size > 0 || actionItemsSet.size > 0 || milestonesSet.size > 0 || peopleSet.size > 0;
  if (hasHighlights) {
    text += `\n*Highlights*\n`;
    if (decisionsSet.size > 0) {
      text += `• Decisions: ${[...decisionsSet].join('; ')}\n`;
    }
    if (actionItemsSet.size > 0) {
      text += `• Action items: ${[...actionItemsSet].join('; ')}\n`;
    }
    if (milestonesSet.size > 0) {
      text += `• Milestones: ${[...milestonesSet].join('; ')}\n`;
    }
    if (peopleSet.size > 0) {
      text += `• People mentioned: ${[...peopleSet].join(', ')}\n`;
    }
  }

  return { text, thoughtCount: count, dateStr: todayDateStr };
}
