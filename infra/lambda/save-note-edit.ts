import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { jsonResponse, getUserId } from './lib/http';
import { withUserScopedClient } from './lib/db';
import { putNoteContent } from './lib/s3';

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const noteId = event.pathParameters?.id;
  if (!noteId) return jsonResponse(400, { error: 'note id is required' });

  let content: unknown;
  try {
    content = JSON.parse(event.body ?? 'null');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }
  if (content === null) return jsonResponse(400, { error: 'content is required' });

  // Confirm the note belongs to this user before writing anything to S3 —
  // WHERE user_id = $1 is the authorization boundary (see lib/db.ts).
  const owned = await withUserScopedClient(userId, async (client, uid) => {
    const result = await client.query('select 1 from notes where user_id = $1 and id = $2', [uid, noteId]);
    return result.rowCount! > 0;
  });
  if (!owned) return jsonResponse(404, { error: 'Note not found' });

  await putNoteContent(userId, noteId, content);

  await withUserScopedClient(userId, async (client, uid) => {
    await client.query(
      `update notes set edited = true, updated_at = now() where user_id = $1 and id = $2`,
      [uid, noteId],
    );
  });

  return jsonResponse(200, { note_id: noteId, edited: true });
}
