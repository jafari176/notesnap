import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { jsonResponse, getUserId } from './lib/http';
import { withUserScopedClient } from './lib/db';
import { deleteNoteContent } from './lib/s3';

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const noteId = event.pathParameters?.id;
  if (!noteId) return jsonResponse(400, { error: 'note id is required' });

  const deleted = await withUserScopedClient(userId, async (client, uid) => {
    const result = await client.query('delete from notes where user_id = $1 and id = $2', [uid, noteId]);
    return result.rowCount! > 0;
  });
  if (!deleted) return jsonResponse(404, { error: 'Note not found' });

  await deleteNoteContent(userId, noteId);

  return jsonResponse(204, null);
}
