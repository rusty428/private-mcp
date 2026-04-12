import { DynamoDBStreamEvent } from 'aws-lambda';

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  for (const record of event.Records) {
    console.log('Stream record:', JSON.stringify(record.dynamodb?.NewImage?.pk));
  }
};
