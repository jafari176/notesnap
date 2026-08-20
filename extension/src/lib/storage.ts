import type { NoteContent } from '../types/note-content';

let uidCounter = 0;
function makeUid(): string {
  uidCounter += 1;
  return `${Date.now().toString(36)}-${uidCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Single entry point every raw note-content payload must pass through —
 * fresh generation responses, GET /notes/{id} responses, and
 * chrome.storage.local reads alike. Assigns a stable client-only `uid` to
 * every leaf array item (ACCOUNTS-AND-STORAGE-SPEC §4 — required for
 * EditableText and React keys, absent from the server schema) and
 * defensively coerces shape so a partially-truncated generation (MVP-SPEC §7)
 * doesn't crash a renderer.
 */
export function normalizeNoteContent(raw: unknown): NoteContent {
  const r = (raw ?? {}) as Partial<NoteContent>;

  const withUid = <T extends object>(item: T): T & { uid: string } => ({
    ...item,
    uid: makeUid(),
  });

  return {
    video: {
      title: r.video?.title ?? '',
      channel: r.video?.channel ?? '',
      duration_s: r.video?.duration_s ?? 0,
      url: r.video?.url ?? '',
    },
    summary: {
      overview: r.summary?.overview ?? '',
      takeaways: (r.summary?.takeaways ?? []).map(withUid),
    },
    sections: (r.sections ?? []).map((s) => ({
      ...withUid(s),
      subsections: (s.subsections ?? []).map(withUid),
    })),
    cheatsheet: {
      key_terms: (r.cheatsheet?.key_terms ?? []).map(withUid),
      formulas: (r.cheatsheet?.formulas ?? []).map(withUid),
      core_concepts: (r.cheatsheet?.core_concepts ?? []).map(withUid),
      exam_traps: (r.cheatsheet?.exam_traps ?? []).map(withUid),
    },
    flashcards: (r.flashcards ?? []).map(withUid),
    practice_questions: (r.practice_questions ?? []).map(withUid),
  };
}

export interface CachedNote {
  note_id: string;
  video_id: string;
  content: NoteContent;
  dirty: boolean;
  updated_at: string;
}

function storageKey(videoId: string): string {
  return `notesnap:note:${videoId}`;
}

export async function getCachedNote(videoId: string): Promise<CachedNote | null> {
  const result = await chrome.storage.local.get(storageKey(videoId));
  return (result[storageKey(videoId)] as CachedNote | undefined) ?? null;
}

export async function setCachedNote(videoId: string, note: CachedNote): Promise<void> {
  await chrome.storage.local.set({ [storageKey(videoId)]: note });
}
