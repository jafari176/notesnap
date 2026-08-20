import type { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

/**
 * CDK Custom Resource: applies schema.sql to the RDS instance on Create/Update.
 * RDS sits in an isolated private subnet with no internet access (correctly),
 * so a migration can't run from a developer machine — this runs inside the
 * VPC as part of the CloudFormation deploy instead.
 */
export async function handler(event: CdkCustomResourceEvent): Promise<CdkCustomResourceResponse> {
  const physicalResourceId = 'NoteSnapSchemaMigration';

  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: physicalResourceId, Status: 'SUCCESS' } as unknown as CdkCustomResourceResponse;
  }

  const secretArn = process.env.DB_CREDENTIALS_SECRET_ARN!;
  const secretResult = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const creds = JSON.parse(secretResult.SecretString!);

  const client = new Client({
    host: process.env.DB_HOST,
    port: 5432,
    database: process.env.DB_NAME,
    user: creds.username,
    password: creds.password,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    await client.query('create extension if not exists pgcrypto'); // gen_random_uuid()
    await client.query(sql);
  } finally {
    await client.end();
  }

  return { PhysicalResourceId: physicalResourceId, Status: 'SUCCESS' } as unknown as CdkCustomResourceResponse;
}
