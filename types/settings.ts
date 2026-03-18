export interface ProjectConfig {
  aliases: string[];
}

export interface EnrichmentSettings {
  types: string[];
  defaultType: string;
  projects: Record<string, ProjectConfig>;
  classificationModel: string;
  specialInstructions: string | null;
  customPrompt: string | null;
  timezone: string;
  updatedAt: string;
}

export const DEFAULT_ENRICHMENT_SETTINGS: EnrichmentSettings = {
  types: [
    'observation', 'task', 'idea', 'reference',
    'person_note', 'decision', 'project_summary', 'milestone',
  ],
  defaultType: 'observation',
  projects: {},
  classificationModel: 'anthropic.claude-3-haiku-20240307-v1:0',
  specialInstructions: null,
  customPrompt: null,
  timezone: 'America/Los_Angeles',
  updatedAt: new Date().toISOString(),
};
