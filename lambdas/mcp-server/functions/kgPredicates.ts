import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);
const tableName = process.env.GRAPH_TABLE_NAME!;

export async function kgPredicates(
  action: 'list' | 'add' | 'remove',
  teamId: string,
  predicate?: string,
): Promise<{ success: boolean; predicates?: string[]; message?: string }> {
  const key = { pk: `CONFIG#${teamId}`, sk: 'PREDICATES' };

  const result = await ddb.send(new GetCommand({
    TableName: tableName,
    Key: key,
  }));

  const current: string[] = (result.Item?.predicates as string[]) || [];

  if (action === 'list') {
    return { success: true, predicates: current };
  }

  if (!predicate || !predicate.trim()) {
    return { success: false, message: 'Predicate is required for add/remove' };
  }

  const normalized = predicate.trim().toLowerCase().replace(/[#]/g, '').replace(/\s+/g, '_');

  if (action === 'add') {
    if (current.includes(normalized)) {
      return { success: false, message: `Predicate "${normalized}" already exists`, predicates: current };
    }
    const updated = [...current, normalized];
    await ddb.send(new PutCommand({
      TableName: tableName,
      Item: { ...key, predicates: updated, updatedAt: new Date().toISOString() },
    }));
    return { success: true, message: `Added "${normalized}"`, predicates: updated };
  }

  if (action === 'remove') {
    if (!current.includes(normalized)) {
      return { success: false, message: `Predicate "${normalized}" not found`, predicates: current };
    }
    const updated = current.filter(p => p !== normalized);
    await ddb.send(new PutCommand({
      TableName: tableName,
      Item: { ...key, predicates: updated, updatedAt: new Date().toISOString() },
    }));
    return { success: true, message: `Removed "${normalized}". Existing triples with this predicate are preserved.`, predicates: updated };
  }

  return { success: false, message: `Invalid action: ${action}` };
}
