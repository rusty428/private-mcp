import { getTodaysThoughts } from './functions/getTodaysThoughts';
import { formatReport } from './functions/formatReport';
import { postToSlack } from './functions/postToSlack';
import { loadSettings } from './functions/loadSettings';

interface DailySummaryResult {
  text: string;
  thoughtCount: number;
  dateStr: string;
}

export const handler = async (): Promise<DailySummaryResult> => {
  const timezone = process.env.DAILY_SUMMARY_TIMEZONE || 'America/Los_Angeles';
  const now = new Date();
  // Scheduled run = morning summary of previous day
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const todayDateStr = yesterday.toLocaleDateString('en-CA', { timeZone: timezone });

  const thoughts = await getTodaysThoughts(todayDateStr);
  const settings = await loadSettings();
  const report = formatReport(todayDateStr, thoughts, settings);

  const channel = process.env.SLACK_CAPTURE_CHANNEL;
  const botToken = process.env.SLACK_BOT_TOKEN;

  if (channel && botToken) {
    await postToSlack(channel, botToken, report.text, report.blocks);
  }

  return report;
};
