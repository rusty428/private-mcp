import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);
const tableName = process.env.GRAPH_TABLE_NAME!;

function normalizeEntityId(name: string): string {
  return name.toLowerCase().trim().replace(/'/g, '').replace(/\s+/g, '-');
}

export async function kgTimeline(
  entity: string,
  teamId: string,
  limit: number = 50,
): Promise<any[]> {
  const entityId = normalizeEntityId(entity);
  const pk = `ENTITY#${teamId}#${entityId}`;

  const outResult = await ddb.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: { ':pk': pk, ':prefix': 'TRIPLE#' },
  }));

  const inResult = await ddb.send(new QueryCommand({
    TableName: tableName,
    IndexName: 'gsi-graph-inverse',
    KeyConditionExpression: 'inversePk = :ipk AND begins_with(inverseSk, :prefix)',
    ExpressionAttributeValues: { ':ipk': pk, ':prefix': 'TRIPLE#' },
  }));

  interface Triple {
    [key: string]: any;
    direction: string;
    valid_from?: string;
    valid_to?: string;
  }

  const allTriples: Triple[] = [
    ...(outResult.Items || []).map((t: any) => ({ ...t, direction: 'outgoing' })),
    ...(inResult.Items || []).map((t: any) => ({ ...t, direction: 'incoming' })),
  ];

  allTriples.sort((a: Triple, b: Triple) => (a.valid_from || '').localeCompare(b.valid_from || ''));

  return allTriples.slice(0, limit).map((t: Triple) => ({
    ...t,
    status: t.valid_to ? 'expired' : 'current',
  }));
}
