import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { loadSettings } from './loadSettings';
import { resolveProjectAlias } from './resolveProjectAlias';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

export async function getProjects(): Promise<string[]> {
  const result = await ddb.send(new GetCommand({
    TableName: process.env.TABLE_NAME,
    Key: { pk: 'META#PROJECTS', sk: 'METADATA' },
  }));

  if (!result.Item || !result.Item.projects) return [];

  // DDB String Set comes back as a Set object
  const rawProjects = result.Item.projects instanceof Set
    ? Array.from(result.Item.projects) as string[]
    : Array.isArray(result.Item.projects)
      ? result.Item.projects
      : [];

  const settings = await loadSettings();

  // Normalize each raw project name through alias resolution, then deduplicate
  const canonicalSet = new Set<string>();
  for (const raw of rawProjects) {
    canonicalSet.add(resolveProjectAlias(raw, settings));
  }

  return Array.from(canonicalSet).sort();
}
