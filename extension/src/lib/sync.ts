import { saveNoteEdit, getNote } from './api-client';
import { getCachedNote, setCachedNote } from './storage';
import type { NoteContent } from '../types/note-content';

const DEBOUNCE_MS = 1500;

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'dirty';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * ACCOUNTS-AND-STORAGE-SPEC §5: local write is already instant (the caller
 * already updated chrome.storage.local before calling this); this only
 * handles the debounced background push to the server. 1.5s of no further
 * edits triggers the push, not per-keystroke.
 */
export function scheduleSync(
  videoId: string,
  noteId: string,
  content: NoteContent,
  onStatusChange: (status: SyncStatus) => void,
): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  onStatusChange('dirty');

  debounceTimer = setTimeout(async () => {
    onStatusChange('syncing');
    try {
      await saveNoteEdit(noteId, content);
      await setCachedNote(videoId, {
        note_id: noteId,
        video_id: videoId,
        content,
        dirty: false,
        updated_at: new Date().toISOString(),
      });
      onStatusChange('synced');
    } catch {
      // Offline or a transient API failure — local copy is never at risk,
      // only the cloud copy is stale. The dirty flag stays set in local
      // storage (setCachedNote above was skipped), so a future edit or
      // reload can retry. No retry-with-backoff loop here yet — out of
      // scope for this milestone, matches the plan's stated build order.
      onStatusChange('offline');
    }
  }, DEBOUNCE_MS);
}

/**
 * Pull-on-load: if the server's copy is newer than the local cache, prefer
 * it. Last-write-wins by updated_at is sufficient for the single-user tier
 * (ACCOUNTS-AND-STORAGE-SPEC §5) — no merge logic for a collaboration
 * problem that doesn't exist in this product yet.
 */
export async function pullIfNewer(videoId: string, noteId: string): Promise<NoteContent | null> {
  const local = await getCachedNote(videoId);
  try {
    const remote = await getNote(noteId);
    // remote.content is null while the server copy is still generating (or
    // failed) — nothing to pull yet, keep whatever the caller already has.
    if (!remote.content) return null;
    if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
      await setCachedNote(videoId, {
        note_id: noteId,
        video_id: videoId,
        content: remote.content,
        dirty: false,
        updated_at: remote.updated_at,
      });
      return remote.content;
    }
    return null; // local is already current, caller keeps what it has
  } catch {
    return null; // offline or API error — keep the local copy, don't block
  }
}
