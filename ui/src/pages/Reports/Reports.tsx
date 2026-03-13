import { useState, useRef, useEffect } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import Button from '@cloudscape-design/components/button';
import DatePicker from '@cloudscape-design/components/date-picker';
import { type SelectProps } from '@cloudscape-design/components/select';
import { ProjectSelect } from '../../components/ProjectSelect';
import Box from '@cloudscape-design/components/box';
import Spinner from '@cloudscape-design/components/spinner';
import { format, subDays } from 'date-fns';
import { api } from '../../api/client';
import type { ThoughtRecord, TimeSeriesResponse } from '../../api/types';
import { StructuredReport } from './StructuredReport';
import { NarrativeSection } from './NarrativeSection';

export function Reports() {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedProject, setSelectedProject] = useState<SelectProps.Option | null>(null);

  const [stats, setStats] = useState<TimeSeriesResponse | null>(null);
  const [thoughts, setThoughts] = useState<ThoughtRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const hasSelected = selectedProject !== null;
  const initialMount = useRef(true);

  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    if (hasSelected) handleGenerate();
  }, [selectedProject]);

  const handleGenerate = async () => {
    setLoading(true);
    setHasGenerated(true);
    try {
      const params: Record<string, string> = {
        startDate,
        endDate,
      };

      if (selectedProject && selectedProject.value) {
        params.project = selectedProject.value;
      }

      const [statsData, thoughtsData] = await Promise.all([
        api.getTimeSeries(params),
        api.listThoughts({ ...params, limit: '1000' }),
      ]);

      setStats(statsData);
      setThoughts(thoughtsData);
    } catch (error) {
      console.error('Failed to generate report:', error);
      setStats(null);
      setThoughts([]);
    } finally {
      setLoading(false);
    }
  };

  const buildMarkdown = (): string => {
    if (!stats) return '';

    let md = `# Thought Report\n\n`;
    md += `**Period:** ${startDate} to ${endDate}\n`;
    if (selectedProject && selectedProject.value) {
      md += `**Project:** ${selectedProject.value}\n`;
    }
    md += `\n---\n\n`;

    md += `## Summary\n\n`;
    md += `- **Total Thoughts:** ${stats.totalInRange}\n`;
    md += `- **Projects:** ${stats.projects.length}\n`;
    md += `- **Action Items:** ${stats.actionItemCount}\n\n`;

    md += `## Type Breakdown\n\n`;
    Object.entries(stats.byType).forEach(([type, count]) => {
      md += `- ${type}: ${count}\n`;
    });
    md += `\n`;

    md += `## Source Breakdown\n\n`;
    Object.entries(stats.bySource).forEach(([source, count]) => {
      md += `- ${source}: ${count}\n`;
    });
    md += `\n`;

    if (stats.topTopics.length > 0) {
      md += `## Top Topics\n\n`;
      stats.topTopics.slice(0, 10).forEach((topic) => {
        md += `- ${topic.topic} (${topic.count})\n`;
      });
      md += `\n`;
    }

    const actionItems = thoughts.filter(
      (t) => t.metadata.action_items && t.metadata.action_items.length > 0
    );
    if (actionItems.length > 0) {
      md += `## Open Action Items\n\n`;
      actionItems.forEach((thought) => {
        const d = new Date(thought.metadata.thought_date || thought.metadata.created_at || '');
        const dateStr = isNaN(d.getTime()) ? 'Unknown date' : format(d, 'MMM d, yyyy');
        md += `### ${thought.metadata.project || 'No project'} - ${dateStr}\n\n`;
        thought.metadata.action_items.forEach((item) => {
          md += `- ${item}\n`;
        });
        md += `\n`;
      });
    }

    return md;
  };

  const handleCopyMarkdown = async () => {
    const markdown = buildMarkdown();
    try {
      await navigator.clipboard.writeText(markdown);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const handleDownloadMarkdown = () => {
    const markdown = buildMarkdown();
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thought-report-${startDate}-to-${endDate}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <ContentLayout
      header={<Header variant="h1">Reports</Header>}
    >
    <SpaceBetween size="m">
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <Box variant="awsui-key-label">Start Date</Box>
          <DatePicker
            value={startDate}
            onChange={(e) => setStartDate(e.detail.value)}
            placeholder="YYYY-MM-DD"
          />
        </div>
        <div>
          <Box variant="awsui-key-label">End Date</Box>
          <DatePicker
            value={endDate}
            onChange={(e) => setEndDate(e.detail.value)}
            placeholder="YYYY-MM-DD"
          />
        </div>
        <div>
          <Box variant="awsui-key-label">Project</Box>
          <ProjectSelect
            selectedOption={selectedProject as any}
            onChange={(opt) => setSelectedProject(opt)}
            placeholder="Select Project"
            allLabel="All Projects"
          />
        </div>
        <Button variant="primary" onClick={handleGenerate} loading={loading} disabled={!hasSelected}>
          Generate Report
        </Button>
        {!loading && stats && (
          <>
            <Button onClick={handleCopyMarkdown}>Copy as Markdown</Button>
            <Button onClick={handleDownloadMarkdown}>Download Markdown</Button>
          </>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spinner size="large" />
        </div>
      )}

      {!loading && hasGenerated && !stats && (
        <Box textAlign="center" color="text-status-inactive" padding="xxl">
          Failed to generate report. Please try again.
        </Box>
      )}

      {!loading && stats && thoughts && (
        <>

          <StructuredReport thoughts={thoughts} stats={stats} />

          <NarrativeSection
            startDate={startDate}
            endDate={endDate}
            project={selectedProject?.value}
          />
        </>
      )}
    </SpaceBetween>
    </ContentLayout>
  );
}
