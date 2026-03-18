import { EnrichmentSettings } from '../../../types/settings';

// NOTE: This function is intentionally duplicated in every Lambda (enrich-thought,
// rest-api, daily-summary). Each Lambda is self-contained with no shared code
// directories so it can be independently bundled. This is by design, not copy-paste debt.
export function resolveProjectAlias(name: string, settings: EnrichmentSettings): string {
  if (!name) return name;
  const lower = name.toLowerCase();

  for (const canonical of Object.keys(settings.projects)) {
    if (canonical.toLowerCase() === lower) return canonical;
  }

  for (const [canonical, config] of Object.entries(settings.projects)) {
    for (const alias of config.aliases) {
      if (alias.toLowerCase() === lower) return canonical;
    }
  }

  return name;
}
