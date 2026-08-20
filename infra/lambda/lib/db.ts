import { Client } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

interface DbCredentials {
  username: string;
  password: string;
}

let cachedCredentials: DbCredentials | undefined;

async function getCredentials(): Promise<DbCredentials> {
  if (cachedCredentials) return cachedCredentials;
  const secretArn = process.env.DB_CREDENTIALS_SECRET_ARN;
  if (!secretArn) throw new Error('DB_CREDENTIALS_SECRET_ARN not set');
  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!result.SecretString) throw new Error('DB credentials secret has no SecretString');
  cachedCredentials = JSON.parse(result.SecretString);
  return cachedCredentials!;
}

async function getClient(): Promise<Client> {
  const creds = await getCredentials();
  const client = new Client({
    host: process.env.DB_HOST,
    port: 5432,
    database: process.env.DB_NAME,
    user: creds.username,
    password: creds.password,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

/**
 * Every note query MUST go through here so `user_id = $1` is structurally
 * impossible to omit — RDS has no row-level security like Supabase/Postgres RLS,
 * so this helper is the actual authorization boundary (AWS-ARCHITECTURE-SPEC §3.1).
 */
export async function withUserScopedClient<T>(
  userId: string,
  fn: (client: Client, userId: string) => Promise<T>,
): Promise<T> {
  if (!userId) throw new Error('userId is required for any notes query');
  const client = await getClient();
  try {
    return await fn(client, userId);
  } finally {
    await client.end();
  }
}
