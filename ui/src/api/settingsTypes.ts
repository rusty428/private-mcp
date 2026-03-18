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
  generatedPrompt: string;
}
