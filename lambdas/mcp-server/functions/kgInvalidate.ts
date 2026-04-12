import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);
const tableName = process.env.GRAPH_TABLE_NAME!;

function normalizeEntityId(name: string): string {
  return name.toLowerCase().trim().replace(/'/g, '').replace(/\s+/g, '-');
}

export async function kgInvalidate(
  subject: string,
  predicate: string,
  object: string,
  teamId: string,
  ended?: string,
): Promise<{ success: boolean; message: string }> {
  const subjectId = normalizeEntityId(subject);
  const objectId = normalizeEntityId(object);
  const validTo = ended || new Date().toISOString().split('T')[0];

  try {
    await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: {
        pk: `ENTITY#${teamId}#${subjectId}`,
        sk: `TRIPLE#${predicate}#${objectId}`,
      },
      UpdateExpression: 'SET valid_to = :validTo',
      ConditionExpression: 'attribute_exists(pk) AND attribute_not_exists(valid_to)',
      ExpressionAttributeValues: { ':validTo': validTo },
    }));
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      return { success: false, message: `No active triple found: (${subject}, ${predicate}, ${object})` };
    }
    throw err;
  }

  return { success: true, message: `Invalidated: (${subject}, ${predicate}, ${object}) — ended ${validTo}` };
}
