import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

export async function getProjects(): Promise<string[]> {
  const result = await ddb.send(new GetCommand({
    TableName: process.env.TABLE_NAME,
    Key: { pk: 'META#PROJECTS', sk: 'METADATA' },
  }));

  if (!result.Item || !result.Item.projects) return [];

  // DDB String Set comes back as a Set object
  const projects = result.Item.projects instanceof Set
    ? Array.from(result.Item.projects) as string[]
    : Array.isArray(result.Item.projects)
      ? result.Item.projects
      : [];

  return projects.sort();
}
