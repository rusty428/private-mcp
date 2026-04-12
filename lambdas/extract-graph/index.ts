import { DynamoDBStreamEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { RawTriple } from '../../types/graph';
import { upsertEntity } from './functions/upsertEntity';
import { writeTriple } from './functions/writeTriple';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);
const tableName = process.env.GRAPH_TABLE_NAME!;

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  for (const record of event.Records) {
    if (!record.dynamodb?.NewImage) continue;

    const item = unmarshall(record.dynamodb.NewImage as any);

    const rawTriples: RawTriple[] = item.raw_triples;
    if (!rawTriples || rawTriples.length === 0) continue;

    const teamId: string = item.team_id;
    const thoughtId: string = item.pk?.replace('THOUGHT#', '') || 'unknown';
    const validFrom: string = item.created_at || new Date().toISOString();

    for (const triple of rawTriples) {
      try {
        await upsertEntity(ddb, tableName, triple.subject, triple.subject_type, teamId, thoughtId);
        await upsertEntity(ddb, tableName, triple.object, triple.object_type, teamId, thoughtId);
        await writeTriple(ddb, tableName, triple, teamId, thoughtId, validFrom);
      } catch (err) {
        console.error(`Failed to write triple (${triple.subject} ${triple.predicate} ${triple.object}):`, err);
      }
    }
  }
};
