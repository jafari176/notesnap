#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { InfraStack } from '../lib/infra-stack';

const app = new cdk.App();
new InfraStack(app, 'NoteSnapStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // EU-West (Ireland): NoteSnap targets EU users via ads — keep data resident in the EU for GDPR.
    region: 'eu-west-1',
  },
  terminationProtection: true,
});
