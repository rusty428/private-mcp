import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

interface QueryByProjectParams {
  project: string;
  startDate?: string;
  endDate?: string;
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

  do {
    const result = await ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: 'gsi-by-project',
      KeyConditionExpression: keyCondition,
      ExpressionAttributeNames: { '#project': 'project' },
      ExpressionAttributeValues: {
        ...expressionValues,
        ':noise': 'noise',
      },
      FilterExpression: '(attribute_not_exists(quality) OR quality <> :noise)',
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
