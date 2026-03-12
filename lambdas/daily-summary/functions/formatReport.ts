import { ThoughtMetadata } from '../../../types/thought';

interface ThoughtWithKey {
  key: string;
  metadata: ThoughtMetadata;
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: { type: string; text: string }[];
}

export interface DailySummaryReport {
  text: string;
  blocks: SlackBlock[];
  thoughtCount: number;
  dateStr: string;
}

interface TaggedItem {
  text: string;
  project: string;
}

const MAX_ITEMS = 5;
const MAX_ITEM_LENGTH = 150;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}

function formatCappedList(
  label: string,
  items: TaggedItem[],
  projectIndex: Map<string, string>
): string {
  const shown = items.slice(0, MAX_ITEMS).map(i => {
    const tag = (i.project && projectIndex.get(i.project.toLowerCase())) || '-';
    return `  • \`${tag}\` ${truncate(i.text, MAX_ITEM_LENGTH)}`;
  });
  const overflow = items.length - MAX_ITEMS;
  let text = `*${label}* (${items.length})\n${shown.join('\n')}`;
  if (overflow > 0) {
    text += `\n  _...and ${overflow} more_`;
  }
  return text;
}

export function formatReport(
  todayDateStr: string,
  thoughts: ThoughtWithKey[]
): DailySummaryReport {
  const count = thoughts.length;

  if (count === 0) {
    const text = `Daily Summary — ${todayDateStr}\n\nNo thoughts captured yesterday.`;
    return {
      text,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `Daily Summary — ${todayDateStr}` } },
        { type: 'section', text: { type: 'mrkdwn', text: 'No thoughts captured yesterday.' } },
      ],
      thoughtCount: 0,
      dateStr: todayDateStr,
    };
  }

  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const decisions: TaggedItem[] = [];
  const decisionKeys = new Set<string>();
  const actionItems: TaggedItem[] = [];
  const actionItemKeys = new Set<string>();
  const milestones: TaggedItem[] = [];
  const milestoneKeys = new Set<string>();
  const peopleSet = new Set<string>();
  // Track project names: key=lowercase, value=map of variant->count
  const projectVariants: Record<string, Record<string, number>> = {};

  function addProject(name: string) {
    const key = name.toLowerCase();
    if (!projectVariants[key]) projectVariants[key] = {};
    projectVariants[key][name] = (projectVariants[key][name] || 0) + 1;
  }

  function addTaggedItem(
    list: TaggedItem[],
    keys: Set<string>,
    text: string,
    project: string
  ) {
    if (!keys.has(text)) {
      keys.add(text);
      list.push({ text, project });
    }
  }

  for (const t of thoughts) {
    const m = t.metadata;
    byType[m.type] = (byType[m.type] || 0) + 1;
    bySource[m.source] = (bySource[m.source] || 0) + 1;

    if (m.type === 'decision') {
      addTaggedItem(decisions, decisionKeys, m.summary || m.content, m.project);
    }
    if (m.type === 'milestone') {
      addTaggedItem(milestones, milestoneKeys, m.summary || m.content, m.project);
    }
    if (Array.isArray(m.action_items)) {
      for (const ai of m.action_items) {
        addTaggedItem(actionItems, actionItemKeys, ai, m.project);
      }
    }
    if (Array.isArray(m.people)) {
      for (const p of m.people) peopleSet.add(p);
    }
    if (m.project) addProject(m.project);
    if (Array.isArray(m.related_projects)) {
      for (const rp of m.related_projects) addProject(rp);
    }
  }

  // Pick the most-used variant for each project
  const projects = Object.values(projectVariants)
    .map(variants => Object.entries(variants).sort((a, b) => b[1] - a[1])[0][0])
    .sort();

  // Build project letter index: lowercase project name -> letter
  const projectIndex = new Map<string, string>();
  projects.forEach((p, i) => {
    projectIndex.set(p.toLowerCase(), LETTERS[i] || '?');
  });

  const sourceStr = Object.entries(bySource)
    .map(([src, n]) => `${n} ${src}`)
    .join(', ');

  const typeStr = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${n} ${type}`)
    .join(', ');

  // Build blocks
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `Daily Summary — ${todayDateStr}` },
  });

  // Performance
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Performance*\n• ${count} thoughts captured (${sourceStr})\n• Types: ${typeStr}`,
    },
  });

  // Projects with letter designators
  if (projects.length > 0) {
    const projectsList = projects
      .map((p, i) => `\`${LETTERS[i]}\`  ${p}`)
      .join('\n');
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Projects* (${projects.length})\n${projectsList}` },
    });
  }

  // Decisions
  if (decisions.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: formatCappedList('Decisions', decisions, projectIndex) },
    });
  }

  // Action Items
  if (actionItems.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: formatCappedList('Action Items', actionItems, projectIndex) },
    });
  }

  // Milestones
  if (milestones.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: formatCappedList('Milestones', milestones, projectIndex) },
    });
  }

  // People (context block at bottom)
  if (peopleSet.size > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*People mentioned:* ${[...peopleSet].join(', ')}` }],
    });
  }

  // Plain text fallback
  let text = `Daily Summary — ${todayDateStr}\n`;
  text += `${count} thoughts captured (${sourceStr})\n`;
  text += `Types: ${typeStr}`;

  return { text, blocks, thoughtCount: count, dateStr: todayDateStr };
}
