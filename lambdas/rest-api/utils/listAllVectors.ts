import { S3VectorsClient, ListVectorsCommand, GetVectorsCommand } from '@aws-sdk/client-s3vectors';

const s3vectors = new S3VectorsClient({ region: process.env.REGION });

export async function listAllVectors(): Promise<Array<{ key: string; metadata: any }>> {
  const allKeys: string[] = [];
  let nextToken: string | undefined;

  do {
    const listResponse: any = await s3vectors.send(new ListVectorsCommand({
      vectorBucketName: process.env.VECTOR_BUCKET_NAME,
      indexName: process.env.VECTOR_INDEX_NAME,
      ...(nextToken ? { nextToken } : {}),
    }));

    if (listResponse.vectors) {
      allKeys.push(...listResponse.vectors.map((v: any) => v.key));
    }
    nextToken = listResponse.nextToken;
  } while (nextToken);

  if (allKeys.length === 0) return [];

  const allVectors: Array<{ key: string; metadata: any }> = [];
  for (let i = 0; i < allKeys.length; i += 100) {
    const batch = allKeys.slice(i, i + 100);
    const getResponse = await s3vectors.send(new GetVectorsCommand({
      vectorBucketName: process.env.VECTOR_BUCKET_NAME,
      indexName: process.env.VECTOR_INDEX_NAME,
      keys: batch,
      returnMetadata: true,
    }));
    if (getResponse.vectors) {
      allVectors.push(...getResponse.vectors.map((v: any) => ({ key: v.key, metadata: v.metadata })));
    }
  }

  return allVectors;
}
