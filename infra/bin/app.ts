#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { config } from '../lib/config';

const app = new cdk.App();

const env = {
  account: config.accountId,
  region: config.region,
};

// Stacks will be added in Task 3

Object.entries(config.tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});
