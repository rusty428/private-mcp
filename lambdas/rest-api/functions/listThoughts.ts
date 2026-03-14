import { queryThoughts } from '../utils/queryThoughts';

interface ListThoughtsParams {
  type?: string;
  source?: string;
  project?: string;
  startDate?: string;
  endDate?: string;
  pageSize?: number;
  nextToken?: string;
}

export async function listThoughts(params: ListThoughtsParams) {
  return queryThoughts({
    pageSize: params.pageSize || 25,
    nextToken: params.nextToken,
    type: params.type,
    project: params.project,
    source: params.source,
    startDate: params.startDate,
    endDate: params.endDate,
  });
}
