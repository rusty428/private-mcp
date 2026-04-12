import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { RawTriple } from '../../../types/graph';
import { normalizeEntityId } from './normalizeEntity';

export async function writeTriple(
  ddb: DynamoDBDocumentClient,
  tableName: string,
  triple: RawTriple,
  teamId: string,
  sourceThoughtId: string,
  validFrom: string,
): Promise<void> {
  const subjectId = normalizeEntityId(triple.subject);
  const objectId = normalizeEntityId(triple.object);
  const now = new Date().toISOString();

  try {
    await ddb.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: `ENTITY#${teamId}#${subjectId}`,
        sk: `TRIPLE#${triple.predicate}#${objectId}`,
        subject: triple.subject,
        predicate: triple.predicate,
        object: triple.object,
        inversePk: `ENTITY#${teamId}#${objectId}`,
        inverseSk: `TRIPLE#${triple.predicate}#${subjectId}`,
        team_id: teamId,
        confidence: triple.confidence,
        valid_from: validFrom,
        source_thought_id: sourceThoughtId,
        created_at: now,
      },
      ConditionExpression: 'attribute_not_exists(sk)',
    }));
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      return;
    }
    throw err;
  }
}
