import { ProcessThoughtResult } from '../../../types/thought';

export function formatConfirmation(result: ProcessThoughtResult): string {
  let confirmation = `Captured as *${result.type}*`;

  if (result.topics.length > 0) {
    confirmation += ` — ${result.topics.join(', ')}`;
  }
  if (result.people.length > 0) {
    confirmation += `\nPeople: ${result.people.join(', ')}`;
  }
  if (result.action_items.length > 0) {
    confirmation += `\nAction items: ${result.action_items.join('; ')}`;
  }

  return confirmation;
}
