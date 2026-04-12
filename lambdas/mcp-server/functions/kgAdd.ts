import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { EntityType, VALID_ENTITY_TYPES, DEFAULT_PREDICATES } from '../../../types/graph';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);
const tableName = process.env.GRAPH_TABLE_NAME!;

function normalizeEntityId(name: string): string {
  return name.toLowerCase().trim().replace(/'/g, '').replace(/\s+/g, '-');
}

async function loadPredicates(teamId: string): Promise<string[]> {
  const result = await ddb.send(new GetCommand({
    TableName: tableName,
    Key: { pk: `CONFIG#${teamId}`, sk: 'PREDICATES' },
  }));
  return (result.Item?.predicates as string[]) || [...DEFAULT_PREDICATES];
}

async function upsertEntity(
  name: string,
  entityType: EntityType,
  teamId: string,
): Promise<void> {
  const entityId = normalizeEntityId(name);
  const now = new Date().toISOString();
  try {
    await ddb.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: `ENTITY#${teamId}#${entityId}`,
        sk: 'META',
        name,
        entity_type: entityType,
        team_id: teamId,
        created_at: now,
        updated_at: now,
        source_thought_id: 'manual',
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
  } catch (err: any) {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  }
}

export async function kgAdd(
  subject: string,
  predicate: string,
  object: string,
  teamId: string,
  subjectType?: string,
  objectType?: string,
): Promise<{ success: boolean; message: string }> {
  const validPredicates = await loadPredicates(teamId);
  if (!validPredicates.includes(predicate)) {
    return { success: false, message: `Invalid predicate "${predicate}". Valid: ${validPredicates.join(', ')}` };
  }

  const subjectEntityType: EntityType = VALID_ENTITY_TYPES.includes(subjectType as EntityType)
    ? (subjectType as EntityType)
    : 'topic';
  const objectEntityType: EntityType = VALID_ENTITY_TYPES.includes(objectType as EntityType)
    ? (objectType as EntityType)
    : 'topic';

  const subjectId = normalizeEntityId(subject);
  const objectId = normalizeEntityId(object);
  const now = new Date().toISOString();

  await upsertEntity(subject, subjectEntityType, teamId);
  await upsertEntity(object, objectEntityType, teamId);

  try {
    await ddb.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: `ENTITY#${teamId}#${subjectId}`,
        sk: `TRIPLE#${predicate}#${objectId}`,
        subject,
        predicate,
        object,
        inversePk: `ENTITY#${teamId}#${objectId}`,
        inverseSk: `TRIPLE#${predicate}#${subjectId}`,
        team_id: teamId,
        confidence: 1.0,
        valid_from: now,
        source_thought_id: 'manual',
        created_at: now,
      },
      ConditionExpression: 'attribute_not_exists(sk)',
    }));
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      return { success: false, message: `Triple already active: (${subject}, ${predicate}, ${object})` };
    }
    throw err;
  }

  return { success: true, message: `Added: (${subject}, ${predicate}, ${object})` };
}
