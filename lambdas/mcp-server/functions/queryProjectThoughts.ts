import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

export interface ProjectThought {
  topics: string[];
  people: string[];
  type: string;
  thought_date: string;
}

export async function queryProjectThoughts(project: string, teamId: string): Promise<ProjectThought[]> {
  const items: ProjectThought[] = [];
  let lastKey: Record<string, any> | undefined;

  do {
    const result = await ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: 'gsi-by-project',
      KeyConditionExpression: '#p = :project',
      FilterExpression: 'team_id = :teamId AND (attribute_not_exists(quality) OR quality <> :noise)',
      ProjectionExpression: 'topics, people, #t, thought_date',
      ExpressionAttributeNames: { '#p': 'project', '#t': 'type' },
      ExpressionAttributeValues: {
        ':project': project,
        ':teamId': teamId,
        ':noise': 'noise',
      },
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    }));

    for (const item of result.Items || []) {
      items.push({
        topics: item.topics || [],
        people: item.people || [],
        type: item.type || '',
        thought_date: item.thought_date || '',
      });
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}
