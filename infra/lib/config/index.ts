export interface PrivateMCPConfig {
  accountId: string;
  region: string;
  applicationId: string;
  tags: Record<string, string>;
}

if (!process.env.AWS_ACCOUNT_ID) {
  throw new Error('AWS_ACCOUNT_ID is required in .env — see .env.example');
}

export const config: PrivateMCPConfig = {
  accountId: process.env.AWS_ACCOUNT_ID,
  region: process.env.AWS_REGION || 'us-west-2',
  applicationId: 'private-mcp',
  tags: {
    Project: 'PrivateMCP',
    ManagedBy: 'cdk',
  },
};
