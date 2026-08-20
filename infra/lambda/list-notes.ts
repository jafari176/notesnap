import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { jsonResponse, getUserId } from './lib/http';
import { withUserScopedClient } from './lib/db';

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);

  const rows = await withUserScopedClient(userId, async (client, uid) => {
    const result = await client.query(
      `select id, video_id, video_title, video_channel, video_url, duration_s, edited, status, error_message, created_at, updated_at
       from notes where user_id = $1 order by updated_at desc`,
      [uid],
    );
    return result.rows;
  });

  return jsonResponse(200, { notes: rows });
}
