import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3vectors from 'aws-cdk-lib/aws-s3vectors';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { PrivateMCPConfig } from '../config';
import {
  VECTOR_BUCKET_NAME,
  VECTOR_INDEX_NAME,
  VECTOR_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  THOUGHTS_TABLE_NAME,
  SETTINGS_TABLE_NAME,
} from '../../../types/config';
import { DEFAULT_ENRICHMENT_SETTINGS } from '../../../types/settings';

interface PrivateMCPStackProps extends cdk.StackProps {
  config: PrivateMCPConfig;
}

export class PrivateMCPStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PrivateMCPStackProps) {
    super(scope, id, props);

    const { config } = props;

    // --- S3 Vectors ---
    const vectorBucket = new s3vectors.CfnVectorBucket(this, 'ThoughtsBucket', {
      vectorBucketName: VECTOR_BUCKET_NAME,
    });
    vectorBucket.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    const vectorIndex = new s3vectors.CfnIndex(this, 'ThoughtsIndex', {
      vectorBucketName: VECTOR_BUCKET_NAME,
      indexName: VECTOR_INDEX_NAME,
      dataType: 'float32',
      dimension: VECTOR_DIMENSIONS,
      distanceMetric: 'cosine',
    });
    vectorIndex.addDependency(vectorBucket);
    vectorIndex.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    // --- DynamoDB ---
    const thoughtsTable = new dynamodb.Table(this, 'ThoughtsTable', {
      tableName: THOUGHTS_TABLE_NAME,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    thoughtsTable.addGlobalSecondaryIndex({
      indexName: 'gsi-by-month',
      partitionKey: { name: 'month', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    thoughtsTable.addGlobalSecondaryIndex({
      indexName: 'gsi-by-project',
      partitionKey: { name: 'project', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // --- Settings DynamoDB Table ---
    const settingsTable = new dynamodb.Table(this, 'SettingsTable', {
      tableName: SETTINGS_TABLE_NAME,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Seed enrichment settings on first deploy (won't overwrite existing)
    const seedParams = {
      service: 'DynamoDB',
      action: 'putItem',
      parameters: {
        TableName: SETTINGS_TABLE_NAME,
        Item: {
          pk: { S: 'enrichment' },
          sk: { S: 'config' },
          types: { L: DEFAULT_ENRICHMENT_SETTINGS.types.map(t => ({ S: t })) },
          defaultType: { S: DEFAULT_ENRICHMENT_SETTINGS.defaultType },
          projects: { M: {} },
          classificationModel: { S: DEFAULT_ENRICHMENT_SETTINGS.classificationModel },
          updatedAt: { S: new Date().toISOString() },
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      },
      physicalResourceId: cr.PhysicalResourceId.of('seed-enrichment-settings'),
    };

    new cr.AwsCustomResource(this, 'SeedEnrichmentSettings', {
      onCreate: seedParams,
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['dynamodb:PutItem'],
          resources: [settingsTable.tableArn],
        }),
      ]),
    });

    // --- Common Lambda environment ---
    const commonEnv = {
      REGION: config.region,
      VECTOR_BUCKET_NAME: VECTOR_BUCKET_NAME,
      VECTOR_INDEX_NAME: VECTOR_INDEX_NAME,
      TABLE_NAME: THOUGHTS_TABLE_NAME,
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
        `arn:aws:s3vectors:${config.region}:${config.accountId}:vector-bucket/${VECTOR_BUCKET_NAME}`,
        `arn:aws:s3vectors:${config.region}:${config.accountId}:vector-bucket/${VECTOR_BUCKET_NAME}/*`,
        `arn:aws:s3vectors:${config.region}:${config.accountId}:bucket/${VECTOR_BUCKET_NAME}`,
        `arn:aws:s3vectors:${config.region}:${config.accountId}:bucket/${VECTOR_BUCKET_NAME}/*`,
      ],
    });

    // --- DynamoDB IAM policies ---
    const ddbWritePolicy = new iam.PolicyStatement({
      actions: ['dynamodb:PutItem', 'dynamodb:UpdateItem'],
      resources: [thoughtsTable.tableArn],
    });

    const ddbReadWritePolicy = new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:DescribeTable',
      ],
      resources: [
        thoughtsTable.tableArn,
        `${thoughtsTable.tableArn}/index/*`,
      ],
    });

    // --- Settings DynamoDB IAM policies ---
    const settingsReadPolicy = new iam.PolicyStatement({
      actions: ['dynamodb:GetItem'],
      resources: [settingsTable.tableArn],
    });

    const settingsReadWritePolicy = new iam.PolicyStatement({
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
      resources: [settingsTable.tableArn],
    });

    // --- Bedrock IAM policies ---
    const bedrockEmbedPolicy = new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:${config.region}::foundation-model/${EMBEDDING_MODEL_ID}`,
      ],
    });

    const bedrockClassifyPolicy = new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:*::foundation-model/*`,
      ],
    });

    // --- Marketplace IAM policy (required for first-time Anthropic model access) ---
    const marketplacePolicy = new iam.PolicyStatement({
      actions: [
        'aws-marketplace:ViewSubscriptions',
        'aws-marketplace:Subscribe',
      ],
      resources: ['*'],
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
    processThoughtFn.addToRolePolicy(ddbWritePolicy);

    // --- enrich-thought Lambda (Stage 2 — async enrichment) ---
    const enrichThoughtFn = new nodejs.NodejsFunction(this, 'EnrichThoughtFn', {
      entry: 'lambdas/enrich-thought/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: commonEnv,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });
    enrichThoughtFn.addToRolePolicy(s3VectorsPolicy);
    enrichThoughtFn.addToRolePolicy(bedrockEmbedPolicy);
    enrichThoughtFn.addToRolePolicy(bedrockClassifyPolicy);
    enrichThoughtFn.addToRolePolicy(marketplacePolicy);
    enrichThoughtFn.addToRolePolicy(ddbWritePolicy);
    enrichThoughtFn.addToRolePolicy(settingsReadPolicy);
    enrichThoughtFn.addEnvironment('SETTINGS_TABLE_NAME', SETTINGS_TABLE_NAME);

    // process-thought invokes enrich-thought async
    enrichThoughtFn.grantInvoke(processThoughtFn);
    processThoughtFn.addEnvironment('ENRICH_THOUGHT_FN_NAME', enrichThoughtFn.functionName);

    // --- ingest-thought Lambda ---
    const ingestThoughtFn = new nodejs.NodejsFunction(this, 'IngestThoughtFn', {
      entry: 'lambdas/ingest-thought/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        ...commonEnv,
        SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN || '',
        SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET || '',
        SLACK_CAPTURE_CHANNEL: process.env.SLACK_CAPTURE_CHANNEL || '',
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
    mcpServerFn.addToRolePolicy(bedrockEmbedPolicy);
    mcpServerFn.addToRolePolicy(settingsReadPolicy);
    mcpServerFn.addEnvironment('SETTINGS_TABLE_NAME', SETTINGS_TABLE_NAME);

    // --- daily-summary Lambda ---
    const dailySummaryFn = new nodejs.NodejsFunction(this, 'DailySummaryFn', {
      entry: 'lambdas/daily-summary/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        ...commonEnv,
        SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN || '',
        SLACK_CAPTURE_CHANNEL: process.env.SLACK_CAPTURE_CHANNEL || '',
        DAILY_SUMMARY_TIMEZONE: process.env.DAILY_SUMMARY_TIMEZONE || 'America/Los_Angeles',
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });
    dailySummaryFn.addToRolePolicy(s3VectorsPolicy);

    // EventBridge scheduled rule for daily summary
    const summaryHour = process.env.DAILY_SUMMARY_HOUR || '18';
    new events.Rule(this, 'DailySummarySchedule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: summaryHour,
        month: '*',
        weekDay: '*',
        year: '*',
      }),
      targets: [new targets.LambdaFunction(dailySummaryFn)],
    });

    // Allow mcp-server to invoke daily-summary
    dailySummaryFn.grantInvoke(mcpServerFn);
    mcpServerFn.addEnvironment('DAILY_SUMMARY_FN_NAME', dailySummaryFn.functionName);

    // --- rest-api Lambda (UI backend) ---
    const restApiFn = new nodejs.NodejsFunction(this, 'RestApiFn', {
      entry: 'lambdas/rest-api/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        ...commonEnv,
        PROCESS_THOUGHT_FN_NAME: processThoughtFn.functionName,
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '',
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });
    restApiFn.addToRolePolicy(s3VectorsPolicy);
    restApiFn.addToRolePolicy(bedrockEmbedPolicy);
    restApiFn.addToRolePolicy(bedrockClassifyPolicy);
    processThoughtFn.grantInvoke(restApiFn);
    restApiFn.addToRolePolicy(ddbReadWritePolicy);
    restApiFn.addToRolePolicy(settingsReadWritePolicy);
    restApiFn.addEnvironment('SETTINGS_TABLE_NAME', SETTINGS_TABLE_NAME);

    // --- API Gateway Access Logs ---
    const apiLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: '/aws/apigateway/PrivateMCP',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- API Gateway ---
    const api = new apigateway.RestApi(this, 'PrivateMCPApi', {
      restApiName: 'PrivateMCP',
      description: 'Private MCP server API',
      deployOptions: {
        stageName: 'api',
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
      apiKeyName: 'private-mcp-key',
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

    // REST API endpoints for UI (API key secured)
    const restApiIntegration = new apigateway.LambdaIntegration(restApiFn);

    const thoughtsResource = api.root.addResource('thoughts');
    thoughtsResource.addMethod('GET', restApiIntegration, { apiKeyRequired: true });

    const thoughtByIdResource = thoughtsResource.addResource('{id}');
    thoughtByIdResource.addMethod('GET', restApiIntegration, { apiKeyRequired: true });
    thoughtByIdResource.addMethod('PUT', restApiIntegration, { apiKeyRequired: true });
    thoughtByIdResource.addMethod('DELETE', restApiIntegration, { apiKeyRequired: true });

    const searchResource = api.root.addResource('search');
    searchResource.addMethod('POST', restApiIntegration, { apiKeyRequired: true });

    const captureResource = api.root.addResource('capture');
    captureResource.addMethod('POST', restApiIntegration, { apiKeyRequired: true });

    const statsResource = api.root.addResource('stats');
    const timeseriesResource = statsResource.addResource('timeseries');
    timeseriesResource.addMethod('GET', restApiIntegration, { apiKeyRequired: true });

    const reportsResource = api.root.addResource('reports');
    const generateResource = reportsResource.addResource('generate');
    generateResource.addMethod('POST', restApiIntegration, { apiKeyRequired: true });

    const projectsResource = api.root.addResource('projects');
    projectsResource.addMethod('GET', restApiIntegration, { apiKeyRequired: true });

    const settingsResource = api.root.addResource('settings');
    const enrichmentSettingsResource = settingsResource.addResource('enrichment');
    enrichmentSettingsResource.addMethod('GET', restApiIntegration, { apiKeyRequired: true });
    enrichmentSettingsResource.addMethod('PUT', restApiIntegration, { apiKeyRequired: true });

    // --- Optional: API alarms (only if ALERT_EMAIL is configured) ---
    if (process.env.ALERT_EMAIL) {
      const sns = cdk.aws_sns;
      const subscriptions = cdk.aws_sns_subscriptions;
      const cloudwatch = cdk.aws_cloudwatch;
      const actions = cdk.aws_cloudwatch_actions;

      const alarmTopic = new sns.Topic(this, 'ApiAlarmTopic', {
        topicName: 'PrivateMCP-ApiAlarms',
      });
      alarmTopic.addSubscription(
        new subscriptions.EmailSubscription(process.env.ALERT_EMAIL)
      );

      const alarm5xx = new cloudwatch.Alarm(this, 'Api5xxAlarm', {
        metric: api.metricServerError({ period: cdk.Duration.minutes(5) }),
        threshold: 5,
        evaluationPeriods: 1,
        alarmDescription: 'PrivateMCP API: 5+ server errors in 5 minutes',
      });
      alarm5xx.addAlarmAction(new actions.SnsAction(alarmTopic));
    }

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

    new cdk.CfnOutput(this, 'ThoughtsTableName', {
      value: thoughtsTable.tableName,
      description: 'DynamoDB thoughts table name',
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API Key ID — retrieve value with: aws apigateway get-api-key --api-key <id> --include-value',
    });
  }
}
