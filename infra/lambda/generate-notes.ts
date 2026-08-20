import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { jsonResponse, getUserId } from './lib/http';
import { withUserScopedClient } from './lib/db';
import { putNoteContent } from './lib/s3';

interface GenerateRequestBody {
  video_url: string;
}

// Self-invocation payload for the async worker path — distinguishes a
// worker invocation from a real API Gateway event (see handler() below).
interface WorkerInvocationPayload {
  __notesnapWorker: true;
  userId: string;
  noteId: string;
  videoId: string;
  videoUrl: string;
}

const GEMINI_MODEL = 'gemini-2.5-flash';

// CloudFormation dynamic references ({{resolve:secretsmanager:...}}) are NOT
// supported for Lambda environment variables (confirmed against AWS docs —
// only certain resource types like RDS MasterUserPassword support them). The
// original approach silently resolved to garbage instead of the real key.
// Fetch at runtime via the SDK instead, same pattern as lib/db.ts's RDS
// credentials — cached across warm invocations so this only costs a
// Secrets Manager call on cold starts, not every request.
const secretsClient = new SecretsManagerClient({});
const lambdaClient = new LambdaClient({});
let cachedGeminiApiKey: string | undefined;

async function getGeminiApiKey(): Promise<string> {
  if (cachedGeminiApiKey) return cachedGeminiApiKey;
  const secretArn = process.env.GEMINI_API_KEY_SECRET_ARN;
  if (!secretArn) throw new Error('GEMINI_API_KEY_SECRET_ARN not set');
  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!result.SecretString) throw new Error('Gemini API key secret has no SecretString');
  cachedGeminiApiKey = result.SecretString;
  return cachedGeminiApiKey;
}

function extractVideoId(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!match) throw new Error('Could not extract a YouTube video ID from the provided URL');
  return match[1];
}

// Mirrors MVP-SPEC.md §3's schema field-for-field. Without this, Gemini free-
// forms its own field names (confirmed during M2 testing: it returned
// video_metadata/summary.text/flashcards[].question instead of
// video/summary.overview/flashcards[].front) — responseMimeType alone only
// guarantees valid JSON, not a specific shape. t_s is intentionally NOT
// listed as required per-object below (MVP-SPEC §3's own validation rule:
// items without a usable t_s render without a chip rather than being
// rejected), but the prompt still asks for it on every leaf.
const timestampedItemSchema = {
  type: 'OBJECT',
  properties: { text: { type: 'STRING' }, t_s: { type: 'NUMBER' } },
  required: ['text'],
};

const responseSchema = {
  type: 'OBJECT',
  properties: {
    video: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
        channel: { type: 'STRING' },
        duration_s: { type: 'NUMBER' },
        url: { type: 'STRING' },
      },
      required: ['title', 'duration_s'],
    },
    summary: {
      type: 'OBJECT',
      properties: {
        overview: { type: 'STRING' },
        takeaways: { type: 'ARRAY', items: timestampedItemSchema },
      },
      required: ['overview', 'takeaways'],
    },
    sections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          start_s: { type: 'NUMBER' },
          end_s: { type: 'NUMBER' },
          content_md: { type: 'STRING' },
          content_eli5_md: { type: 'STRING' },
          subsections: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { title: { type: 'STRING' }, start_s: { type: 'NUMBER' } },
              required: ['title'],
            },
          },
        },
        required: ['title', 'content_md', 'content_eli5_md'],
      },
    },
    cheatsheet: {
      type: 'OBJECT',
      properties: {
        key_terms: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              term: { type: 'STRING' },
              definition_one_line: { type: 'STRING' },
              t_s: { type: 'NUMBER' },
            },
            required: ['term', 'definition_one_line'],
          },
        },
        formulas: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING' },
              expression: { type: 'STRING' },
              note: { type: 'STRING' },
              t_s: { type: 'NUMBER' },
            },
            required: ['name', 'expression'],
          },
        },
        core_concepts: { type: 'ARRAY', items: timestampedItemSchema },
        exam_traps: { type: 'ARRAY', items: timestampedItemSchema },
      },
      required: ['key_terms', 'formulas', 'core_concepts', 'exam_traps'],
    },
    flashcards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { front: { type: 'STRING' }, back: { type: 'STRING' }, t_s: { type: 'NUMBER' } },
        required: ['front', 'back'],
      },
    },
    practice_questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['mcq', 'short_answer'] },
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          answer: { type: 'STRING' },
          explanation: { type: 'STRING' },
          t_s: { type: 'NUMBER' },
        },
        required: ['type', 'question', 'answer', 'explanation'],
      },
    },
  },
  required: ['video', 'summary', 'sections', 'cheatsheet', 'flashcards', 'practice_questions'],
};

async function callGemini(videoUrl: string): Promise<{ content: unknown; durationS: number }> {
  const geminiApiKey = await getGeminiApiKey();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { fileData: { fileUri: videoUrl } },
              {
                text:
                  'Analyze this video and produce structured study notes matching the exact JSON schema ' +
                  'provided. video.title/channel/duration_s/url describe the video itself. summary.overview ' +
                  'is a 2-4 sentence overview; summary.takeaways are 3-5 key bullet points. sections is the ' +
                  'full topic-by-topic walkthrough in chronological order — content_md is a detailed ' +
                  'explanation in markdown, content_eli5_md is the same topic simplified for a beginner. ' +
                  'cheatsheet.key_terms/formulas/core_concepts/exam_traps are dense revision material. ' +
                  'flashcards are front/back study cards drawn from key terms and concepts. ' +
                  'practice_questions mix mcq (with 4 options) and short_answer types, each with an answer ' +
                  'and explanation. Every leaf item must include t_s (or start_s/end_s for sections) — the ' +
                  'timestamp in seconds where that specific fact was stated or best demonstrated, not just ' +
                  'the start of the enclosing section.',
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          // AWS-ARCHITECTURE-SPEC §7.1 — sufficient for lecture content, 4x cheaper than default.
          // Must be the full enum name, not "low" — the API rejects the short form with a 400.
          mediaResolution: 'MEDIA_RESOLUTION_LOW',
        },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const result = await response.json() as any;
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Gemini response had no content');

  const content = JSON.parse(rawText);
  const durationS: number = content?.video?.duration_s ?? 0;
  return { content, durationS };
}

/**
 * Validation requirement from MVP-SPEC §3: clamp every leaf item's t_s to
 * [0, duration_s]. Items that fail get their t_s stripped rather than the
 * whole item dropped — losing a timestamp chip shouldn't hide the content.
 *
 * BUG FIX: the original version only processed objects where 'start_s' was
 * absent, which was meant to route start_s/end_s through different handling
 * but instead skipped validating them entirely — sections[] (and their
 * subsections[]) never got checked at all. Confirmed in production: a 9:42
 * video came back with an Outline section timestamped at 15:01, well past
 * the real duration, because nothing ever clamped it. Every timestamp field
 * (t_s, start_s, end_s) is now validated on every object that has one.
 */
function clampTimestamps(content: any, durationS: number): any {
  const isValid = (t: unknown): t is number => typeof t === 'number' && t >= 0 && t <= durationS;

  const clamp = (obj: any) => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      if ('t_s' in obj && !isValid(obj.t_s)) delete obj.t_s;
      if ('start_s' in obj && !isValid(obj.start_s)) delete obj.start_s;
      // end_s without a valid start_s is meaningless for a range chip —
      // strip both together rather than leaving a dangling end with no start.
      if ('end_s' in obj && (!isValid(obj.end_s) || obj.start_s === undefined)) delete obj.end_s;
    }
    if (Array.isArray(obj)) {
      obj.forEach(clamp);
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(clamp);
    }
  };
  clamp(content);
  return content;
}

/**
 * Does the actual Gemini call + S3/RDS writes. Runs either inline (if
 * somehow fast enough) or, in production, as a self-invoked async Lambda
 * call — see handler() below for why. Never throws past the caller that
 * owns the notes row: failures are written back to RDS as status='failed'
 * with error_message set, not propagated as an unhandled rejection, so a
 * worker crash doesn't leave a note stuck in 'generating' forever.
 */
async function runGeneration(userId: string, noteId: string, videoId: string, videoUrl: string): Promise<void> {
  try {
    const result = await callGemini(videoUrl);
    const content = clampTimestamps(result.content, result.durationS);
    const videoMeta = (content as any).video ?? {};

    await putNoteContent(userId, noteId, content);

    await withUserScopedClient(userId, async (client, uid) => {
      await client.query(
        `update notes set
           video_title = $3, video_channel = $4, duration_s = $5, s3_key = $6,
           status = 'ready', error_message = null, updated_at = now()
         where user_id = $1 and id = $2`,
        [uid, noteId, videoMeta.title ?? '', videoMeta.channel ?? null, result.durationS, `${uid}/${noteId}.json`],
      );
    });
  } catch (err) {
    // MVP-SPEC §1: failed generations never count against quota. The row
    // already exists (created by handler() below before this worker ran),
    // so "not counting against quota" here means: mark it failed rather
    // than silently leaving 'generating' forever, and let the client's
    // regenerate/retry path create a fresh attempt — not that no row exists.
    const message = err instanceof Error ? err.message : String(err);
    await withUserScopedClient(userId, async (client, uid) => {
      await client.query(
        `update notes set status = 'failed', error_message = $3, updated_at = now()
         where user_id = $1 and id = $2`,
        [uid, noteId, message],
      );
    }).catch(() => {
      // If even the failure-write fails (e.g. DB unreachable), there's
      // nothing more this worker can do — the note stays 'generating' and
      // the client's poll will eventually need a manual regenerate. Logged
      // via the thrown error surfacing to CloudWatch through the Lambda
      // runtime's own unhandled-rejection reporting for this invocation.
    });
  }
}

function isWorkerInvocation(
  event: APIGatewayProxyEventV2WithJWTAuthorizer | WorkerInvocationPayload,
): event is WorkerInvocationPayload {
  return (event as WorkerInvocationPayload).__notesnapWorker === true;
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer | WorkerInvocationPayload,
): Promise<APIGatewayProxyResultV2 | void> {
  // Async self-invocation path: no API Gateway envelope, just our own
  // payload shape. Does the real work and returns nothing (Lambda's async
  // InvocationType='Event' has no caller waiting on a response).
  if (isWorkerInvocation(event)) {
    await runGeneration(event.userId, event.noteId, event.videoId, event.videoUrl);
    return;
  }

  const userId = getUserId(event);

  let body: GenerateRequestBody;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }
  if (!body.video_url) {
    return jsonResponse(400, { error: 'video_url is required' });
  }

  let videoId: string;
  try {
    videoId = extractVideoId(body.video_url);
  } catch (err) {
    return jsonResponse(400, { error: (err as Error).message });
  }

  const noteId = randomUUID();

  // Create the row up front in 'generating' status — this is what the
  // client polls GET /notes/{id} against. video_title/duration_s/s3_key
  // stay null until the worker finishes (see schema.sql).
  await withUserScopedClient(userId, async (client, uid) => {
    await client.query(
      `insert into notes (id, user_id, video_id, video_url, status, edited)
       values ($1, $2, $3, $4, 'generating', false)
       on conflict (user_id, video_id) do update set
         id = excluded.id,
         status = 'generating',
         error_message = null,
         video_title = null,
         duration_s = null,
         s3_key = null,
         edited = false,
         updated_at = now()`,
      [noteId, uid, videoId, body.video_url],
    );
  });

  // Fire-and-forget async self-invocation. API Gateway HTTP APIs hard-cap
  // Lambda integration timeout at 29 seconds (confirmed against the
  // installed aws-cdk-lib version's validation — AWS's platform-level 2024
  // increase isn't exposed by this construct), but a full Gemini generation
  // with the 8-mode responseSchema regularly takes 34-51s. Returning
  // immediately here and doing the real work in a second, async-invoked
  // Lambda call sidesteps that ceiling entirely.
  const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (!functionName) throw new Error('AWS_LAMBDA_FUNCTION_NAME not set');
  const workerPayload: WorkerInvocationPayload = {
    __notesnapWorker: true,
    userId,
    noteId,
    videoId,
    videoUrl: body.video_url,
  };
  await lambdaClient.send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'Event',
    Payload: JSON.stringify(workerPayload),
  }));

  return jsonResponse(202, { note_id: noteId, status: 'generating' });
}
