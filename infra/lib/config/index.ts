export interface AWSPrivateMCPConfig {
  accountId: string;
  region: string;
  applicationId: string;
  tags: Record<string, string>;
}

export const config: AWSPrivateMCPConfig = {
  accountId: '', // SET AFTER ACCOUNT CREATION
  region: 'us-west-2',
  applicationId: 'aws-private-mcp',
  tags: {
    Project: 'AWSPrivateMCP',
    ManagedBy: 'cdk',
  },
};
