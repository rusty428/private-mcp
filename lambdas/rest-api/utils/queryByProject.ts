import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

interface QueryByProjectParams {
  project: string;
  startDate?: string;
  endDate?: string;
  team_id?: string;
}

export async function queryByProject(params: QueryByProjectParams): Promise<Array<{ key: string; metadata: Record<string, any> }>> {
  const items: Array<{ key: string; metadata: Record<string, any> }> = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  const keyCondition = params.startDate && params.endDate
    ? '#project = :project AND created_at BETWEEN :start AND :end'
    : '#project = :project';

  const expressionValues: Record<string, any> = { ':project': params.project };
  if (params.startDate) expressionValues[':start'] = params.startDate;
  if (params.endDate) expressionValues[':end'] = params.endDate + 'T23:59:59';

  const filterConditions = ['(attribute_not_exists(quality) OR quality <> :noise)'];
  expressionValues[':noise'] = 'noise';

  if (params.team_id) {
    filterConditions.push('team_id = :filterTeam');
    expressionValues[':filterTeam'] = params.team_id;
  }

  do {
    const result = await ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: 'gsi-by-project',
      KeyConditionExpression: keyCondition,
      ExpressionAttributeNames: { '#project': 'project' },
      ExpressionAttributeValues: expressionValues,
      FilterExpression: filterConditions.join(' AND '),
      ScanIndexForward: false,
      ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
    }));

    if (result.Items) {
      for (const item of result.Items) {
        const { pk, sk, month, enriched, ...metadata } = item;
        items.push({
          key: (pk as string).replace('THOUGHT#', ''),
          metadata,
        });
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}
