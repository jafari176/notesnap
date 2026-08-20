import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { jsonResponse, getUserId } from './lib/http';
import { withUserScopedClient } from './lib/db';
import { getNoteContent } from './lib/s3';

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const noteId = event.pathParameters?.id;
  if (!noteId) return jsonResponse(400, { error: 'note id is required' });

  const row = await withUserScopedClient(userId, async (client, uid) => {
    const result = await client.query(
      `select id, video_id, video_title, video_channel, video_url, duration_s, edited, status, error_message, created_at, updated_at
       from notes where user_id = $1 and id = $2`,
      [uid, noteId],
    );
    return result.rows[0];
  });

  if (!row) return jsonResponse(404, { error: 'Note not found' });

  // Client polls this endpoint while status = 'generating' — no S3 object
  // exists yet, so don't attempt the fetch (get-note.ts previously always
  // fetched content, which assumed generation had already completed
  // synchronously; no longer true once generate-notes.ts returns 202 and
  // finishes the real work in an async worker invocation).
  if (row.status !== 'ready') {
    return jsonResponse(200, { ...row, content: null });
  }

  const content = await getNoteContent(userId, noteId);
  return jsonResponse(200, { ...row, content });
}
