import { APIGatewayClient, GetApiKeysCommand } from '@aws-sdk/client-api-gateway';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash, randomBytes } from 'crypto';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const s3 = new S3Client({});

export const handler = async (event: any): Promise<any> => {
  const requestType = event.RequestType;

  if (requestType !== 'Create') {
    return { PhysicalResourceId: 'seed-api-key', Data: {} };
  }

  const apiKeysTableName = process.env.API_KEYS_TABLE_NAME!;
  const configBucketName = process.env.CONFIG_BUCKET_NAME!;
  const upgradeFromV1 = process.env.UPGRADE_FROM_V1 === 'true';

  // Check if a key already exists in the api-keys table
  const existingRecord = await ddb.send(new GetCommand({
    TableName: apiKeysTableName,
    Key: { keyId: 'default-owner-key' },
  }));

  if (existingRecord.Item) {
    return { PhysicalResourceId: 'seed-api-key', Data: { Message: 'Key already exists' } };
  }

  let rawKey: string | undefined;
  let migratedFromV1 = false;

  // On v1 upgrade, read the existing API Gateway key (still exists during CREATE phase)
  if (upgradeFromV1) {
    try {
      const apigw = new APIGatewayClient({});
      const keysResponse = await apigw.send(new GetApiKeysCommand({
        nameQuery: 'private-mcp-key',
        includeValues: true,
      }));
      if (keysResponse.items && keysResponse.items.length > 0) {
        rawKey = keysResponse.items[0].value;
        migratedFromV1 = true;
        console.log('Migrating existing API Gateway key to DynamoDB');
      }
    } catch (err) {
      console.error('Could not read existing API Gateway key:', err);
    }
  }

  // Generate new key if not upgrading or lookup failed
  if (!rawKey) {
    rawKey = `pmcp_${randomBytes(32).toString('hex')}`;
    console.log('Generating new API key');
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

  // Write the raw key to S3 config bucket (not CloudFormation outputs, which are unencrypted and persistent)
  if (!migratedFromV1) {
    await s3.send(new PutObjectCommand({
      Bucket: configBucketName,
      Key: 'seed-api-key.json',
      Body: JSON.stringify({ apiKey: rawKey }),
      ContentType: 'application/json',
    }));
    console.log(`Seed API key written to s3://${configBucketName}/seed-api-key.json`);
  }

  return {
    PhysicalResourceId: 'seed-api-key',
    Data: {
      Message: migratedFromV1 ? 'Existing key migrated from API Gateway' : 'New key written to S3 config bucket',
    },
  };
};
