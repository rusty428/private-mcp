import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { EntityType } from '../../../types/graph';
import { normalizeEntityId } from './normalizeEntity';

export async function upsertEntity(
  ddb: DynamoDBDocumentClient,
  tableName: string,
  name: string,
  entityType: EntityType,
  teamId: string,
  sourceThoughtId: string,
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
        source_thought_id: sourceThoughtId,
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      return;
    }
    throw err;
  }
}
