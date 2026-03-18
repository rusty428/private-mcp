import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({ region: process.env.REGION });

interface DailySummaryResult {
  text: string;
  thoughtCount: number;
  dateStr: string;
}

export async function invokeDailySummary(): Promise<DailySummaryResult> {
  const response = await lambda.send(new InvokeCommand({
    FunctionName: process.env.DAILY_SUMMARY_FN_NAME,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({})),
  }));

  const payload = JSON.parse(new TextDecoder().decode(response.Payload));

  if (response.FunctionError) {
    console.error('daily-summary error:', JSON.stringify(payload));
    throw new Error('Failed to generate daily summary');
  }

  return payload;
}
