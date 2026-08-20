import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const s3Client = new S3Client({});

function bucketName(): string {
  const name = process.env.NOTES_BUCKET_NAME;
  if (!name) throw new Error('NOTES_BUCKET_NAME not set');
  return name;
}

// Bucket layout: {user_id}/{note_id}.json (AWS-ARCHITECTURE-SPEC §3.2)
function noteKey(userId: string, noteId: string): string {
  return `${userId}/${noteId}.json`;
}

export async function putNoteContent(userId: string, noteId: string, content: unknown): Promise<void> {
  await s3Client.send(new PutObjectCommand({
    Bucket: bucketName(),
    Key: noteKey(userId, noteId),
    Body: JSON.stringify(content),
    ContentType: 'application/json',
    ServerSideEncryption: 'AES256',
  }));
}

export async function getNoteContent(userId: string, noteId: string): Promise<unknown> {
  const result = await s3Client.send(new GetObjectCommand({
    Bucket: bucketName(),
    Key: noteKey(userId, noteId),
  }));
  const body = await result.Body?.transformToString();
  if (!body) throw new Error('Note content object had no body');
  return JSON.parse(body);
}

export async function deleteNoteContent(userId: string, noteId: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({
    Bucket: bucketName(),
    Key: noteKey(userId, noteId),
  }));
}

/**
 * GDPR Article 17 erasure support: delete every object under a user's prefix,
 * not just a single note. Used by delete-account.
 */
export async function deleteAllUserContent(userId: string): Promise<void> {
  let continuationToken: string | undefined;
  do {
    const listResult = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucketName(),
      Prefix: `${userId}/`,
      ContinuationToken: continuationToken,
    }));
    const objects = listResult.Contents ?? [];
    for (const obj of objects) {
      if (!obj.Key) continue;
      await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName(), Key: obj.Key }));
    }
    continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
  } while (continuationToken);
}
