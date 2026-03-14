import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

interface QueryThoughtsParams {
  pageSize?: number;
  nextToken?: string;
  type?: string;
  project?: string;
  source?: string;
  startDate?: string;
  endDate?: string;
  maxRecords?: number;
}

interface QueryThoughtsResult {
  items: Array<{ key: string; metadata: Record<string, any> }>;
  hasMore: boolean;
  nextToken?: string;
}

interface DecodedCursor {
  month: string;
  lastEvaluatedKey?: Record<string, any>;
}

function encodeToken(cursor: DecodedCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

function decodeToken(token: string): DecodedCursor {
  return JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
}

function getMonthRange(startDate?: string, endDate?: string): string[] {
  const end = endDate || new Date().toISOString().slice(0, 10);
  const endMonth = end.slice(0, 7);

  // Default: 6-month lookback
  const start = startDate || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const startMonth = start.slice(0, 7);

  const months: string[] = [];
  let current = endMonth;
  while (current >= startMonth) {
    months.push(current);
    // Decrement month
    const [y, m] = current.split('-').map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    current = prev;
  }
  return months; // Newest month first
}

function buildFilterExpression(params: QueryThoughtsParams): {
  filterExpression?: string;
  expressionValues: Record<string, any>;
  expressionNames: Record<string, string>;
} {
  const conditions: string[] = [];
  const values: Record<string, any> = {};
  const names: Record<string, string> = {};

  // Always exclude noise
  conditions.push('(attribute_not_exists(quality) OR quality <> :noise)');
  values[':noise'] = 'noise';

  if (params.type) {
    conditions.push('#t = :filterType');
    values[':filterType'] = params.type;
    names['#t'] = 'type';
  }

  if (params.project) {
    conditions.push('project = :filterProject');
    values[':filterProject'] = params.project;
  }

  if (params.source) {
    conditions.push('#src = :filterSource');
    values[':filterSource'] = params.source;
    names['#src'] = 'source';
  }

  if (params.startDate) {
    conditions.push('(thought_date >= :startDate OR (attribute_not_exists(thought_date) AND created_at >= :startDateFull))');
    values[':startDate'] = params.startDate;
    values[':startDateFull'] = params.startDate;
  }

  if (params.endDate) {
    conditions.push('(thought_date <= :endDate OR (attribute_not_exists(thought_date) AND created_at <= :endDateFull))');
    values[':endDate'] = params.endDate;
    values[':endDateFull'] = params.endDate + 'T23:59:59';
  }

  return {
    filterExpression: conditions.length > 0 ? conditions.join(' AND ') : undefined,
    expressionValues: values,
    expressionNames: names,
  };
}

export async function queryThoughts(params: QueryThoughtsParams): Promise<QueryThoughtsResult> {
  const pageSize = params.pageSize || 25;
  const maxRecords = params.maxRecords || 500;
  const items: Array<{ key: string; metadata: Record<string, any> }> = [];

  // Determine starting point
  let cursor: DecodedCursor;
  if (params.nextToken) {
    cursor = decodeToken(params.nextToken);
  } else {
    const months = getMonthRange(params.startDate, params.endDate);
    cursor = { month: months[0] };
  }

  const months = getMonthRange(params.startDate, params.endDate);
  const monthIndex = months.indexOf(cursor.month);
  if (monthIndex === -1) {
    return { items: [], hasMore: false };
  }

  const { filterExpression, expressionValues, expressionNames } = buildFilterExpression(params);

  let currentMonthIdx = monthIndex;
  let lastEvaluatedKey = cursor.lastEvaluatedKey;

  while (items.length < pageSize && currentMonthIdx < months.length) {
    const queryInput: QueryCommandInput = {
      TableName: process.env.TABLE_NAME,
      IndexName: 'gsi-by-month',
      KeyConditionExpression: '#month = :month',
      ExpressionAttributeNames: { '#month': 'month', ...expressionNames },
      ExpressionAttributeValues: { ':month': months[currentMonthIdx], ...expressionValues },
      ScanIndexForward: false, // Newest first
      Limit: pageSize - items.length, // Do NOT over-fetch — LastEvaluatedKey must align with consumed items
      ...(filterExpression ? { FilterExpression: filterExpression } : {}),
      ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
    };

    const result = await ddb.send(new QueryCommand(queryInput));

    if (result.Items) {
      for (const item of result.Items) {
        if (items.length >= pageSize) break;
        const { pk, sk, month, enriched, ...metadata } = item;
        items.push({
          key: (pk as string).replace('THOUGHT#', ''),
          metadata,
        });
      }
    }

    if (result.LastEvaluatedKey && items.length < pageSize) {
      lastEvaluatedKey = result.LastEvaluatedKey;
    } else if (result.LastEvaluatedKey && items.length >= pageSize) {
      // We have enough items but there are more in this month
      return {
        items,
        hasMore: true,
        nextToken: encodeToken({ month: months[currentMonthIdx], lastEvaluatedKey: result.LastEvaluatedKey }),
      };
    } else {
      // Exhausted current month, move to next
      currentMonthIdx++;
      lastEvaluatedKey = undefined;
    }
  }

  const hasMore = currentMonthIdx < months.length;
  return {
    items,
    hasMore,
    nextToken: hasMore ? encodeToken({ month: months[currentMonthIdx] }) : undefined,
  };
}
