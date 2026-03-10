import { ProcessThoughtResult } from '../../../types/thought';

export function formatConfirmation(result: ProcessThoughtResult): string {
  if (result.quality === 'noise') {
    return `Captured (noise) — stored but won't appear in search`;
  }
  return `Captured — enrichment processing async`;
}
