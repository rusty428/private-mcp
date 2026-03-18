interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: { type: string; text: string }[];
}

export async function postToSlack(
  channel: string,
  botToken: string,
  text: string,
  blocks?: SlackBlock[]
): Promise<void> {
  const body: Record<string, unknown> = { channel, text };
  if (blocks) {
    body.blocks = blocks;
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.status}`);
  }
}
