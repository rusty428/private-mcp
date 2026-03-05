export async function postToSlack(channel: string, botToken: string, text: string): Promise<void> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text }),
  });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.status}`);
  }
}
