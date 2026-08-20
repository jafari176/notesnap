import { API_BASE_URL } from './config';
import { getValidAccessToken } from './auth';
import { ApiError, type ApiErrorBody, type GenerateNotesResponse, type GetNoteResponse, type ListNotesResponse, type SaveNoteEditResponse } from '../types/api';
import type { NoteContent } from '../types/note-content';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getValidAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  // Don't assume the body is JSON before checking response.ok — a gateway-
  // level failure (Lambda timeout, throttling, API Gateway's own 503) can
  // return a plain-text or empty body that isn't our Lambda's well-formed
  // { error, detail } shape. Parsing that as JSON unconditionally either
  // throws a SyntaxError that never reaches ApiError's classification, or
  // (worse) can produce a value whose fields are silently undefined,
  // rendering as a blank error message in the UI.
  const rawText = await response.text();
  let body: unknown;
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    body = { error: `HTTP ${response.status}`, detail: rawText || response.statusText || 'No response body' };
  }

  if (!response.ok) {
    const errorBody = body as Partial<ApiErrorBody>;
    throw new ApiError(response.status, {
      error: errorBody.error ?? `Request failed (${response.status})`,
      detail: errorBody.detail ?? (typeof body === 'object' ? undefined : String(body)),
    });
  }

  return body as T;
}

export function generateNotes(videoUrl: string): Promise<GenerateNotesResponse> {
  return request<GenerateNotesResponse>('/notes/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ video_url: videoUrl }),
  });
}

export function listNotes(): Promise<ListNotesResponse> {
  return request<ListNotesResponse>('/notes');
}

export function getNote(noteId: string): Promise<GetNoteResponse> {
  return request<GetNoteResponse>(`/notes/${noteId}`);
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120_000; // generous margin over the ~34-51s typical generation time

/**
 * generate-notes.ts returns 202 immediately and finishes the real Gemini
 * call asynchronously (see that file's comments on API Gateway's 29s
 * integration timeout ceiling) — this polls GET /notes/{id} until the
 * worker flips status to 'ready' or 'failed'.
 */
export async function pollNoteUntilReady(noteId: string): Promise<GetNoteResponse> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const note = await getNote(noteId);
    if (note.status === 'ready') return note;
    if (note.status === 'failed') {
      throw new ApiError(502, { error: 'Video generation failed', detail: note.error_message ?? undefined });
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new ApiError(504, { error: 'Generation is taking longer than expected', detail: 'Try again in a moment.' });
}

// Server expects the bare content object as the request body, not
// { content: {...} } — confirmed by reading infra/lambda/save-note-edit.ts.
export function saveNoteEdit(noteId: string, content: NoteContent): Promise<SaveNoteEditResponse> {
  return request<SaveNoteEditResponse>(`/notes/${noteId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(content),
  });
}

// 204 empty body — request<T>() already short-circuits before .json() parse.
export function deleteNote(noteId: string): Promise<void> {
  return request<void>(`/notes/${noteId}`, { method: 'DELETE' });
}

export function deleteAccount(): Promise<{ deleted: true }> {
  return request<{ deleted: true }>('/account', { method: 'DELETE' });
}
