import { APIGatewayClient, GetApiKeysCommand } from '@aws-sdk/client-api-gateway';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { createHash, randomBytes } from 'crypto';

const apigw = new APIGatewayClient({});
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

export const handler = async (event: any): Promise<any> => {
  const requestType = event.RequestType;

  // Only run on Create
  if (requestType !== 'Create') {
    return { PhysicalResourceId: 'seed-api-key', Data: {} };
  }

  const apiKeysTableName = process.env.API_KEYS_TABLE_NAME!;

  // Check if a key already exists in the api-keys table
  const existingKey = await ddb.send(new GetCommand({
    TableName: apiKeysTableName,
    Key: { keyId: 'default-owner-key' },
  }));

  if (existingKey.Item) {
    return { PhysicalResourceId: 'seed-api-key', Data: { Message: 'Key already exists' } };
  }

  // Try to find and migrate the existing API Gateway key
  let rawKey: string | undefined;

  try {
    const keysResponse = await apigw.send(new GetApiKeysCommand({
      nameQuery: 'private-mcp-key',
      includeValues: true,
    }));

    if (keysResponse.items && keysResponse.items.length > 0) {
      rawKey = keysResponse.items[0].value;
    }
  } catch (err) {
    console.log('Could not read existing API Gateway key:', err);
  }

  // If no existing key found, generate a new one
  if (!rawKey) {
    rawKey = `pmcp_${randomBytes(32).toString('hex')}`;
  }

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
      ApiKey: rawKey,
      Message: 'Key seeded successfully',
    },
  };
};
