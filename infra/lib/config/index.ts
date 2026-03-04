export interface AWSPrivateMCPConfig {
  accountId: string;
  region: string;
  applicationId: string;
  tags: Record<string, string>;
}

export const config: AWSPrivateMCPConfig = {
  accountId: '951921971435',
  region: 'us-west-2',
  applicationId: 'aws-private-mcp',
  tags: {
    Project: 'AWSPrivateMCP',
    ManagedBy: 'cdk',
  },
};
