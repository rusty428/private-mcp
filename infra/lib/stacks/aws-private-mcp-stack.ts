import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3vectors from 'aws-cdk-lib/aws-s3vectors';
import { Construct } from 'constructs';
import { AWSPrivateMCPConfig } from '../config';
import {
  VECTOR_BUCKET_NAME,
  VECTOR_INDEX_NAME,
  VECTOR_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  CLASSIFICATION_MODEL_ID,
} from '../../../types/config';

interface AWSPrivateMCPStackProps extends cdk.StackProps {
  config: AWSPrivateMCPConfig;
}

export class AWSPrivateMCPStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AWSPrivateMCPStackProps) {
    super(scope, id, props);

    const { config } = props;

    // --- S3 Vectors ---
    const vectorBucket = new s3vectors.CfnVectorBucket(this, 'ThoughtsBucket', {
      vectorBucketName: VECTOR_BUCKET_NAME,
    });

    const vectorIndex = new s3vectors.CfnIndex(this, 'ThoughtsIndex', {
      vectorBucketName: VECTOR_BUCKET_NAME,
      indexName: VECTOR_INDEX_NAME,
      dataType: 'float32',
      dimension: VECTOR_DIMENSIONS,
      distanceMetric: 'cosine',
    });
    vectorIndex.addDependency(vectorBucket);

    // --- Common Lambda environment ---
    const commonEnv = {
      REGION: config.region,
      VECTOR_BUCKET_NAME: VECTOR_BUCKET_NAME,
      VECTOR_INDEX_NAME: VECTOR_INDEX_NAME,
    };

    // --- S3 Vectors IAM policy ---
    const s3VectorsPolicy = new iam.PolicyStatement({
      actions: [
        's3vectors:PutVectors',
        's3vectors:QueryVectors',
        's3vectors:GetVectors',
        's3vectors:ListVectors',
        's3vectors:DeleteVectors',
      ],
      resources: [
        `arn:aws:s3vectors:${config.region}:${config.accountId}:vector-bucket/${VECTOR_BUCKET_NAME}/*`,
      ],
    });

    // --- Bedrock IAM policy ---
    const bedrockPolicy = new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:${config.region}::foundation-model/${EMBEDDING_MODEL_ID}`,
        `arn:aws:bedrock:${config.region}::foundation-model/${CLASSIFICATION_MODEL_ID}`,
      ],
    });

    // --- process-thought Lambda ---
    const processThoughtFn = new nodejs.NodejsFunction(this, 'ProcessThoughtFn', {
      entry: 'lambdas/process-thought/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });
    processThoughtFn.addToRolePolicy(s3VectorsPolicy);
    processThoughtFn.addToRolePolicy(bedrockPolicy);

    // --- ingest-thought Lambda ---
    const ingestThoughtFn = new nodejs.NodejsFunction(this, 'IngestThoughtFn', {
      entry: 'lambdas/ingest-thought/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        ...commonEnv,
        SLACK_BOT_TOKEN: this.node.tryGetContext('slackBotToken') || '',
        SLACK_CAPTURE_CHANNEL: this.node.tryGetContext('slackCaptureChannel') || '',
        PROCESS_THOUGHT_FN_NAME: processThoughtFn.functionName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });
    processThoughtFn.grantInvoke(ingestThoughtFn);

    // --- mcp-server Lambda ---
    const mcpServerFn = new nodejs.NodejsFunction(this, 'McpServerFn', {
      entry: 'lambdas/mcp-server/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        ...commonEnv,
        PROCESS_THOUGHT_FN_NAME: processThoughtFn.functionName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });
    processThoughtFn.grantInvoke(mcpServerFn);
    mcpServerFn.addToRolePolicy(s3VectorsPolicy);
    mcpServerFn.addToRolePolicy(bedrockPolicy);

    // --- API Gateway ---
    const api = new apigateway.RestApi(this, 'AWSPrivateMCPApi', {
      restApiName: 'AWSPrivateMCP',
      description: 'AWSPrivateMCP - Private MCP server API',
      deployOptions: {
        stageName: 'api',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
      },
    });

    // Slack webhook endpoint (public)
    const slackResource = api.root.addResource('slack').addResource('events');
    slackResource.addMethod('POST', new apigateway.LambdaIntegration(ingestThoughtFn));

    // MCP endpoint (API key secured)
    const mcpResource = api.root.addResource('mcp');

    // API Key + Usage Plan
    const apiKey = api.addApiKey('MCPApiKey', {
      apiKeyName: 'aws-private-mcp-key',
    });

    const usagePlan = api.addUsagePlan('MCPUsagePlan', {
      name: 'mcp-usage-plan',
      throttle: {
        rateLimit: 10,
        burstLimit: 20,
      },
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({ stage: api.deploymentStage });

    mcpResource.addMethod('POST', new apigateway.LambdaIntegration(mcpServerFn), {
      apiKeyRequired: true,
    });
    mcpResource.addMethod('GET', new apigateway.LambdaIntegration(mcpServerFn), {
      apiKeyRequired: true,
    });
    mcpResource.addMethod('DELETE', new apigateway.LambdaIntegration(mcpServerFn), {
      apiKeyRequired: true,
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'SlackWebhookUrl', {
      value: `${api.url}slack/events`,
      description: 'Slack webhook URL for Event Subscriptions',
    });

    new cdk.CfnOutput(this, 'MCPEndpointUrl', {
      value: `${api.url}mcp`,
      description: 'MCP server endpoint URL',
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API Key ID — retrieve value with: aws apigateway get-api-key --api-key <id> --include-value',
    });
  }
}
