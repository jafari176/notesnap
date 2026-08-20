import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { jsonResponse, getUserId } from './lib/http';
import { withUserScopedClient } from './lib/db';
import { deleteAllUserContent } from './lib/s3';

const cognitoClient = new CognitoIdentityProviderClient({});

/**
 * GDPR Article 17 ("right to erasure") support. Deletes, in order:
 * 1. All note metadata rows in RDS for this user
 * 2. All note content objects in S3 under this user's prefix
 * 3. The Cognito user itself (revokes all sessions/tokens immediately)
 *
 * Order matters: delete data first, identity last — if the Cognito delete
 * succeeds but a data delete step failed, the user would be locked out
 * with orphaned data instead of the reverse (data gone, account still usable).
 */
export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);

  await withUserScopedClient(userId, async (client, uid) => {
    await client.query('delete from notes where user_id = $1', [uid]);
  });

  await deleteAllUserContent(userId);

  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) throw new Error('USER_POOL_ID not set');
  await cognitoClient.send(new AdminDeleteUserCommand({
    UserPoolId: userPoolId,
    Username: userId,
  }));

  return jsonResponse(200, { deleted: true });
}
