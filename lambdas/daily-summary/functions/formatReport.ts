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
  thoughts: ThoughtWithKey[],
  totalCount: number
): DailySummaryReport {
  const count = thoughts.length;

  if (count === 0) {
    return {
      text: `*Daily Summary — ${todayDateStr}*\n\nNo thoughts captured today. Total stored: ${totalCount}`,
      thoughtCount: 0,
      dateStr: todayDateStr,
    };
  }

  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const decisions: string[] = [];
  const actionItems: string[] = [];
  const milestones: string[] = [];
  const peopleSet = new Set<string>();

  for (const t of thoughts) {
    const m = t.metadata;
    byType[m.type] = (byType[m.type] || 0) + 1;
    bySource[m.source] = (bySource[m.source] || 0) + 1;

    if (m.type === 'decision') decisions.push(m.content);
    if (m.type === 'milestone') milestones.push(m.content);
    for (const ai of m.action_items) actionItems.push(ai);
    for (const p of m.people) peopleSet.add(p);
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
  text += `• Total stored: ${totalCount}\n`;

  const hasHighlights = decisions.length > 0 || actionItems.length > 0 || milestones.length > 0 || peopleSet.size > 0;
  if (hasHighlights) {
    text += `\n*Highlights*\n`;
    if (decisions.length > 0) {
      text += `• Decisions: ${decisions.join('; ')}\n`;
    }
    if (actionItems.length > 0) {
      text += `• Action items: ${actionItems.join('; ')}\n`;
    }
    if (milestones.length > 0) {
      text += `• Milestones: ${milestones.join('; ')}\n`;
    }
    if (peopleSet.size > 0) {
      text += `• People mentioned: ${[...peopleSet].join(', ')}\n`;
    }
  }

  return { text, thoughtCount: count, dateStr: todayDateStr };
}
