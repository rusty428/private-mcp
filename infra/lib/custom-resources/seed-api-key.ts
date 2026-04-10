import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { createHash, randomBytes } from 'crypto';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

export const handler = async (event: any): Promise<any> => {
  const requestType = event.RequestType;

  // Only run on Create
  if (requestType !== 'Create') {
    return { PhysicalResourceId: 'seed-api-key', Data: {} };
  }

  const apiKeysTableName = process.env.API_KEYS_TABLE_NAME!;
  const existingApiKey = process.env.EXISTING_API_KEY || '';

  // Check if a key already exists in the api-keys table
  const existingRecord = await ddb.send(new GetCommand({
    TableName: apiKeysTableName,
    Key: { keyId: 'default-owner-key' },
  }));

  if (existingRecord.Item) {
    return { PhysicalResourceId: 'seed-api-key', Data: { Message: 'Key already exists' } };
  }

  // Use existing key if provided (v1 → v2 upgrade), otherwise generate new
  const rawKey = existingApiKey || `pmcp_${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');

  await ddb.send(new PutCommand({
    TableName: apiKeysTableName,
    Item: {
      keyId: 'default-owner-key',
      username: 'owner',
      team_id: 'default',
      keyHash,
      status: 'active',
      label: 'Default owner key',
      createdAt: new Date().toISOString(),
    },
    ConditionExpression: 'attribute_not_exists(keyId)',
  }));

  return {
    PhysicalResourceId: 'seed-api-key',
    Data: {
      ApiKey: existingApiKey ? '(preserved from v1)' : rawKey,
      Message: existingApiKey ? 'Existing key migrated' : 'New key generated',
    },
  };
};
