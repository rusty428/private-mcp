import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { queryThoughts } from '../utils/queryThoughts';

const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;

interface ListThoughtsParams {
  type?: string;
  source?: string;
  project?: string;
  startDate?: string;
  endDate?: string;
  pageSize?: number;
  nextToken?: string;
  maxRecords?: number;
  includeCount?: boolean;
  team_id?: string;
}

export async function listThoughts(params: ListThoughtsParams) {
  const [result, totalCount] = await Promise.all([
    queryThoughts({
      pageSize: params.pageSize || 25,
      nextToken: params.nextToken,
      type: params.type,
      project: params.project,
      source: params.source,
      startDate: params.startDate,
      endDate: params.endDate,
      maxRecords: params.maxRecords,
      team_id: params.team_id,
    }),
    params.includeCount ? getApproximateCount() : undefined,
  ]);
  return { ...result, ...(totalCount !== undefined && { totalCount }) };
}

async function getApproximateCount(): Promise<number> {
  const resp = await ddb.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
  // Subtract 1 for the META#PROJECTS item
  return Math.max(0, (resp.Table?.ItemCount ?? 0) - 1);
}
