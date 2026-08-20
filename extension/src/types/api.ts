import type { NoteContent, NoteMetadata } from './note-content';

export interface GenerateNotesRequest {
  video_url: string;
}

// generate-notes.ts returns 202 immediately (note_id + status only) — API
// Gateway HTTP APIs hard-cap Lambda integration timeout at 29s, but a full
// Gemini generation with the 8-mode responseSchema regularly takes 34-51s.
// The actual content arrives via polling GET /notes/{id}.
export interface GenerateNotesResponse {
  note_id: string;
  status: 'generating';
}

export interface ListNotesResponse {
  notes: NoteMetadata[];
}

export interface GetNoteResponse extends NoteMetadata {
  content: NoteContent | null; // null while status is 'generating' or 'failed'
}

export interface SaveNoteEditResponse {
  note_id: string;
  edited: true;
}

export interface ApiErrorBody {
  error: string;
  detail?: string;
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}
