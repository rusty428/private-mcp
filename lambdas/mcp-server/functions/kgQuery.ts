import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);
const tableName = process.env.GRAPH_TABLE_NAME!;

function normalizeEntityId(name: string): string {
  return name.toLowerCase().trim().replace(/'/g, '').replace(/\s+/g, '-');
}

function isValidAtDate(triple: any, asOf: string): boolean {
  if (triple.valid_from > asOf) return false;
  if (triple.valid_to && triple.valid_to < asOf) return false;
  return true;
}

export interface KgQueryResult {
  entity: any | null;
  outgoing: any[];
  incoming: any[];
}

export async function kgQuery(
  entity: string,
  teamId: string,
  asOf?: string,
  predicate?: string,
  direction: 'outgoing' | 'incoming' | 'both' = 'both',
): Promise<KgQueryResult> {
  const entityId = normalizeEntityId(entity);
  const pk = `ENTITY#${teamId}#${entityId}`;

  const entityResult = await ddb.send(new GetCommand({
    TableName: tableName,
    Key: { pk, sk: 'META' },
  }));

  let outgoing: any[] = [];
  let incoming: any[] = [];

  if (direction === 'outgoing' || direction === 'both') {
    const skPrefix = predicate ? `TRIPLE#${predicate}#` : 'TRIPLE#';
    const outResult = await ddb.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': pk, ':prefix': skPrefix },
    }));
    outgoing = outResult.Items || [];
  }

  if (direction === 'incoming' || direction === 'both') {
    const inversePk = `ENTITY#${teamId}#${entityId}`;
    const skPrefix = predicate ? `TRIPLE#${predicate}#` : 'TRIPLE#';
    const inResult = await ddb.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'gsi-graph-inverse',
      KeyConditionExpression: 'inversePk = :ipk AND begins_with(inverseSk, :prefix)',
      ExpressionAttributeValues: { ':ipk': inversePk, ':prefix': skPrefix },
    }));
    incoming = inResult.Items || [];
  }

  if (asOf) {
    outgoing = outgoing.filter(t => isValidAtDate(t, asOf));
    incoming = incoming.filter(t => isValidAtDate(t, asOf));
  }

  const sortByDate = (a: any, b: any) => (a.valid_from || '').localeCompare(b.valid_from || '');
  outgoing.sort(sortByDate);
  incoming.sort(sortByDate);

  return {
    entity: entityResult.Item || null,
    outgoing,
    incoming,
  };
}
