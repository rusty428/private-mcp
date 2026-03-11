export interface PrivateMCPConfig {
  accountId: string;
  region: string;
  applicationId: string;
  tags: Record<string, string>;
}

export const config: PrivateMCPConfig = {
  accountId: '951921971435',
  region: 'us-west-2',
  applicationId: 'private-mcp',
  tags: {
    Project: 'PrivateMCP',
    ManagedBy: 'cdk',
  },
};
