import { useState, useEffect, useCallback } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';
import FormField from '@cloudscape-design/components/form-field';
import Select from '@cloudscape-design/components/select';
import Input from '@cloudscape-design/components/input';
import TokenGroup from '@cloudscape-design/components/token-group';
import Textarea from '@cloudscape-design/components/textarea';
import Toggle from '@cloudscape-design/components/toggle';
import Button from '@cloudscape-design/components/button';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import Alert from '@cloudscape-design/components/alert';
import Flashbar from '@cloudscape-design/components/flashbar';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import Modal from '@cloudscape-design/components/modal';
import { api } from '../../api/client';
import type { EnrichmentSettings, ProjectConfig } from '../../api/settingsTypes';

const MODEL_OPTIONS = [
  { label: 'Claude 3 Haiku', value: 'anthropic.claude-3-haiku-20240307-v1:0' },
  { label: 'Claude 3.5 Haiku', value: 'anthropic.claude-3-5-haiku-20241022-v1:0' },
  { label: 'Claude 3.5 Sonnet v2', value: 'anthropic.claude-3-5-sonnet-20241022-v2:0' },
  { label: 'Custom', value: '__custom__' },
];

const DEFAULT_SETTINGS: Omit<EnrichmentSettings, 'updatedAt' | 'generatedPrompt'> = {
  types: ['observation', 'task', 'idea', 'reference', 'person_note', 'decision', 'project_summary', 'milestone'],
  defaultType: 'observation',
  projects: {},
  classificationModel: 'anthropic.claude-3-haiku-20240307-v1:0',
  specialInstructions: null,
  customPrompt: null,
};

export function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flashItems, setFlashItems] = useState<any[]>([]);
  const [resetModalVisible, setResetModalVisible] = useState(false);

  // Section 1: Model
  const [selectedModel, setSelectedModel] = useState<{ label: string; value: string }>(MODEL_OPTIONS[0]);
  const [customModelId, setCustomModelId] = useState('');

  // Section 2: Types
  const [types, setTypes] = useState<string[]>([]);
  const [newType, setNewType] = useState('');
  const [defaultType, setDefaultType] = useState<{ label: string; value: string }>({ label: 'observation', value: 'observation' });

  // Section 3: Projects
  const [projects, setProjects] = useState<Array<{ name: string; aliases: string[] }>>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [newAliasInputs, setNewAliasInputs] = useState<Record<string, string>>({});

  // Section 4: Special Instructions
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Section 5: Custom Prompt
  const [customPromptActive, setCustomPromptActive] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const settings = await api.getEnrichmentSettings();
      applySettings(settings);
    } catch (err) {
      setFlashItems([{
        type: 'error',
        content: err instanceof Error ? err.message : 'Failed to load settings',
        dismissible: true,
        onDismiss: () => setFlashItems([]),
      }]);
    } finally {
      setLoading(false);
    }
  }, []);

  const applySettings = (settings: EnrichmentSettings) => {
    // Model
    const modelOption = MODEL_OPTIONS.find(m => m.value === settings.classificationModel);
    if (modelOption) {
      setSelectedModel(modelOption);
      setCustomModelId('');
    } else {
      setSelectedModel(MODEL_OPTIONS[3]); // Custom
      setCustomModelId(settings.classificationModel);
    }

    // Types
    setTypes(settings.types);
    setDefaultType({ label: settings.defaultType, value: settings.defaultType });

    // Projects
    const projectList = Object.entries(settings.projects).map(([name, config]: [string, ProjectConfig]) => ({
      name,
      aliases: config.aliases,
    }));
    setProjects(projectList);

    // Special Instructions
    setSpecialInstructions(settings.specialInstructions || '');

    // Custom Prompt
    setCustomPromptActive(settings.customPrompt !== null);
    setCustomPrompt(settings.customPrompt || '');
  };

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const buildPayload = (): Omit<EnrichmentSettings, 'updatedAt' | 'generatedPrompt'> => {
    const classificationModel = selectedModel.value === '__custom__' ? customModelId : selectedModel.value;
    const projectsMap: Record<string, ProjectConfig> = {};
    for (const p of projects) {
      projectsMap[p.name] = { aliases: p.aliases };
    }
    return {
      types,
      defaultType: defaultType.value,
      projects: projectsMap,
      classificationModel,
      specialInstructions: specialInstructions.trim() || null,
      customPrompt: customPromptActive ? (customPrompt.trim() || null) : null,
    };
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const result = await api.putEnrichmentSettings(buildPayload());
      applySettings(result);
      setFlashItems([{
        type: 'success',
        content: 'Settings saved successfully',
        dismissible: true,
        onDismiss: () => setFlashItems([]),
      }]);
    } catch (err) {
      setFlashItems([{
        type: 'error',
        content: err instanceof Error ? err.message : 'Failed to save settings',
        dismissible: true,
        onDismiss: () => setFlashItems([]),
      }]);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetModalVisible(false);
    try {
      setSaving(true);
      const result = await api.putEnrichmentSettings(DEFAULT_SETTINGS);
      applySettings(result);
      setFlashItems([{
        type: 'success',
        content: 'Settings reset to defaults',
        dismissible: true,
        onDismiss: () => setFlashItems([]),
      }]);
    } catch (err) {
      setFlashItems([{
        type: 'error',
        content: err instanceof Error ? err.message : 'Failed to reset settings',
        dismissible: true,
        onDismiss: () => setFlashItems([]),
      }]);
    } finally {
      setSaving(false);
    }
  };

  const handleAddType = () => {
    const t = newType.trim().toLowerCase();
    if (t && !types.includes(t)) {
      setTypes([...types, t]);
      setNewType('');
    }
  };

  const handleRemoveType = (index: number) => {
    if (types.length <= 1) return;
    const removed = types[index];
    const updated = types.filter((_, i) => i !== index);
    setTypes(updated);
    if (defaultType.value === removed) {
      setDefaultType({ label: updated[0], value: updated[0] });
    }
  };

  const handleAddProject = () => {
    const name = newProjectName.trim();
    if (name && !projects.some(p => p.name === name)) {
      setProjects([...projects, { name, aliases: [] }]);
      setNewProjectName('');
    }
  };

  const handleRemoveProject = (index: number) => {
    setProjects(projects.filter((_, i) => i !== index));
  };

  const handleImportProjects = async () => {
    try {
      const data = await api.getProjects();
      const existing = new Set(projects.map(p => p.name));
      const newProjects = data.projects
        .filter(name => !existing.has(name))
        .map(name => ({ name, aliases: [] }));
      if (newProjects.length > 0) {
        setProjects([...projects, ...newProjects]);
        setFlashItems([{
          type: 'info',
          content: `Imported ${newProjects.length} new project(s)`,
          dismissible: true,
          onDismiss: () => setFlashItems([]),
        }]);
      } else {
        setFlashItems([{
          type: 'info',
          content: 'No new projects to import',
          dismissible: true,
          onDismiss: () => setFlashItems([]),
        }]);
      }
    } catch (err) {
      setFlashItems([{
        type: 'error',
        content: err instanceof Error ? err.message : 'Failed to import projects',
        dismissible: true,
        onDismiss: () => setFlashItems([]),
      }]);
    }
  };

  const handleAddAlias = (projectIndex: number) => {
    const alias = (newAliasInputs[projectIndex] || '').trim();
    if (!alias) return;
    const updated = [...projects];
    if (!updated[projectIndex].aliases.includes(alias)) {
      updated[projectIndex] = {
        ...updated[projectIndex],
        aliases: [...updated[projectIndex].aliases, alias],
      };
      setProjects(updated);
    }
    setNewAliasInputs({ ...newAliasInputs, [projectIndex]: '' });
  };

  const handleRemoveAlias = (projectIndex: number, aliasIndex: number) => {
    const updated = [...projects];
    updated[projectIndex] = {
      ...updated[projectIndex],
      aliases: updated[projectIndex].aliases.filter((_, i) => i !== aliasIndex),
    };
    setProjects(updated);
  };

  const dimmedStyle = customPromptActive
    ? { opacity: 0.5, pointerEvents: 'none' as const }
    : {};

  if (loading) {
    return (
      <ContentLayout header={<Header variant="h1">Settings</Header>}>
        <Box textAlign="center" padding="xxl" color="text-status-inactive">
          Loading settings...
        </Box>
      </ContentLayout>
    );
  }

  return (
    <>
      <ContentLayout
        header={
          <Header
            variant="h1"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => setResetModalVisible(true)} disabled={saving}>
                  Reset to defaults
                </Button>
                <Button variant="primary" onClick={handleSave} loading={saving}>
                  Save
                </Button>
              </SpaceBetween>
            }
          >
            Settings
          </Header>
        }
      >
        <SpaceBetween size="l">
          <Flashbar items={flashItems} />

          {/* Section 1: Extraction Model */}
          <div style={dimmedStyle}>
            <Container header={<Header variant="h2">Extraction Model</Header>}>
              <SpaceBetween size="m">
                <FormField label="Classification model">
                  <Select
                    selectedOption={selectedModel}
                    onChange={({ detail }) => setSelectedModel(detail.selectedOption as any)}
                    options={MODEL_OPTIONS}
                  />
                </FormField>
                {selectedModel.value === '__custom__' && (
                  <FormField label="Custom model ID">
                    <Input
                      value={customModelId}
                      onChange={({ detail }) => setCustomModelId(detail.value)}
                      placeholder="e.g. anthropic.claude-3-haiku-20240307-v1:0"
                    />
                  </FormField>
                )}
              </SpaceBetween>
            </Container>
          </div>

          {/* Section 2: Thought Types */}
          <div style={dimmedStyle}>
            <Container header={<Header variant="h2">Thought Types</Header>}>
              <SpaceBetween size="m">
                <FormField label="Active types" description="At least one type is required">
                  <TokenGroup
                    items={types.map(t => ({ label: t, dismissLabel: `Remove ${t}` }))}
                    onDismiss={({ detail }) => handleRemoveType(detail.itemIndex)}
                  />
                </FormField>
                <FormField label="Add type">
                  <SpaceBetween direction="horizontal" size="xs">
                    <Input
                      value={newType}
                      onChange={({ detail }) => setNewType(detail.value)}
                      placeholder="New type name (lowercase)"
                      onKeyDown={({ detail }) => {
                        if (detail.key === 'Enter') handleAddType();
                      }}
                    />
                    <Button onClick={handleAddType} disabled={!newType.trim()}>Add</Button>
                  </SpaceBetween>
                </FormField>
                <FormField label="Default fallback type">
                  <Select
                    selectedOption={defaultType}
                    onChange={({ detail }) => setDefaultType(detail.selectedOption as any)}
                    options={types.map(t => ({ label: t, value: t }))}
                  />
                </FormField>
              </SpaceBetween>
            </Container>
          </div>

          {/* Section 3: Projects */}
          <div style={dimmedStyle}>
            <Container header={<Header variant="h2">Projects</Header>}>
              <SpaceBetween size="m">
                <Table
                  columnDefinitions={[
                    {
                      id: 'name',
                      header: 'Project',
                      cell: (item) => item.name,
                      width: 200,
                    },
                    {
                      id: 'aliases',
                      header: 'Aliases',
                      cell: (item) => {
                        const idx = projects.indexOf(item);
                        return (
                          <SpaceBetween size="xs">
                            <TokenGroup
                              items={item.aliases.map(a => ({ label: a, dismissLabel: `Remove ${a}` }))}
                              onDismiss={({ detail }) => handleRemoveAlias(idx, detail.itemIndex)}
                            />
                            <SpaceBetween direction="horizontal" size="xs">
                              <Input
                                value={newAliasInputs[idx] || ''}
                                onChange={({ detail }) => setNewAliasInputs({ ...newAliasInputs, [idx]: detail.value })}
                                placeholder="Add alias"
                                onKeyDown={({ detail: d }) => {
                                  if (d.key === 'Enter') handleAddAlias(idx);
                                }}
                              />
                              <Button onClick={() => handleAddAlias(idx)} iconName="add-plus" variant="icon" />
                            </SpaceBetween>
                          </SpaceBetween>
                        );
                      },
                    },
                    {
                      id: 'actions',
                      header: '',
                      cell: (item) => {
                        const idx = projects.indexOf(item);
                        return (
                          <Button onClick={() => handleRemoveProject(idx)} iconName="remove" variant="icon" />
                        );
                      },
                      width: 60,
                    },
                  ]}
                  items={projects}
                  empty={
                    <Box textAlign="center" color="inherit" padding="s">
                      No projects configured
                    </Box>
                  }
                />
                <SpaceBetween direction="horizontal" size="xs">
                  <Input
                    value={newProjectName}
                    onChange={({ detail }) => setNewProjectName(detail.value)}
                    placeholder="Project name"
                    onKeyDown={({ detail }) => {
                      if (detail.key === 'Enter') handleAddProject();
                    }}
                  />
                  <Button onClick={handleAddProject} disabled={!newProjectName.trim()}>
                    Add project
                  </Button>
                  <Button onClick={handleImportProjects} iconName="download">
                    Import from existing data
                  </Button>
                </SpaceBetween>
              </SpaceBetween>
            </Container>
          </div>

          {/* Section 4: Special Instructions */}
          <div style={dimmedStyle}>
            <Container header={<Header variant="h2">Special Instructions</Header>}>
              <FormField
                label="Additional instructions for the classifier"
                description={`${specialInstructions.length}/2000 characters`}
              >
                <Textarea
                  value={specialInstructions}
                  onChange={({ detail }) => {
                    if (detail.value.length <= 2000) setSpecialInstructions(detail.value);
                  }}
                  rows={4}
                  placeholder="e.g. Always classify meeting notes as 'reference' type..."
                />
              </FormField>
            </Container>
          </div>

          {/* Section 5: Custom Prompt (Advanced) */}
          <ExpandableSection headerText="Custom Prompt (Advanced)">
            <Container>
              <SpaceBetween size="m">
                <Toggle
                  checked={customPromptActive}
                  onChange={({ detail }) => setCustomPromptActive(detail.checked)}
                >
                  Use custom classification prompt
                </Toggle>
                {customPromptActive && (
                  <>
                    <Alert type="warning">
                      When a custom prompt is active, the extraction model, types, projects, and special
                      instructions above are ignored. The custom prompt is sent directly to Bedrock as-is.
                    </Alert>
                    <FormField
                      label="Custom prompt"
                      description={`${customPrompt.length}/10000 characters`}
                    >
                      <Textarea
                        value={customPrompt}
                        onChange={({ detail }) => {
                          if (detail.value.length <= 10000) setCustomPrompt(detail.value);
                        }}
                        rows={15}
                        placeholder="Enter your full classification prompt..."
                      />
                    </FormField>
                  </>
                )}
              </SpaceBetween>
            </Container>
          </ExpandableSection>
        </SpaceBetween>
      </ContentLayout>

      {/* Reset Confirmation Modal */}
      <Modal
        visible={resetModalVisible}
        onDismiss={() => setResetModalVisible(false)}
        header="Reset to defaults"
        closeAriaLabel="Close"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setResetModalVisible(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleReset}>
                Reset
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to reset all enrichment settings to their defaults? This will overwrite
        your current types, projects, model selection, and any custom instructions.
      </Modal>
    </>
  );
}
