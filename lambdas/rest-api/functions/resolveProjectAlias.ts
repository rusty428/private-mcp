import { EnrichmentSettings } from '../../../types/settings';

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
