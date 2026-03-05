#!/usr/bin/env node
import 'source-map-support/register';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();
import * as cdk from 'aws-cdk-lib';
import { config } from '../lib/config';
import { AWSPrivateMCPStack } from '../lib/stacks/aws-private-mcp-stack';

const app = new cdk.App();

const env = {
  account: config.accountId,
  region: config.region,
};

new AWSPrivateMCPStack(app, 'AWSPrivateMCPStack', {
  env,
  config,
});

Object.entries(config.tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});
