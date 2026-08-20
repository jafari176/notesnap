import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';

export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * API Gateway's JWT authorizer verifies the Cognito token's signature and
 * expiry before the Lambda ever runs (AWS-ARCHITECTURE-SPEC §2) — this just
 * reads the already-verified `sub` claim. Never re-parse or trust a token
 * passed in the request body/headers instead of this claim.
 */
export function getUserId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (!sub || typeof sub !== 'string') {
    throw new Error('Missing verified sub claim on request');
  }
  return sub;
}
