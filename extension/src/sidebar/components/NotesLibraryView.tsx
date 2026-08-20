import { useEffect, useState } from 'react';
import { listNotes } from '../../lib/api-client';
import type { NoteMetadata } from '../../types/note-content';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const STATUS_LABEL: Record<NoteMetadata['status'], string> = {
  generating: 'Generating…',
  ready: '',
  failed: 'Failed',
};

interface NotesLibraryViewProps {
  onSelect: (note: NoteMetadata) => void;
  onClose: () => void;
}

export function NotesLibraryView({ onSelect, onClose }: NotesLibraryViewProps) {
  const [notes, setNotes] = useState<NoteMetadata[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listNotes()
      .then((res) => {
        if (cancelled) return;
        // Newest first — created_at is what the user actually associates
        // with "when did I make this," even if a later edit bumped updated_at.
        const sorted = [...res.notes].sort((a, b) => b.created_at.localeCompare(a.created_at));
        setNotes(sorted);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="notesnap-library">
      <div className="notesnap-library-header">
        <button className="notesnap-collapse-link" onClick={onClose} aria-label="Back">
          ‹
        </button>
        <strong>My Notes</strong>
      </div>

      {error && <p className="notesnap-error">{error}</p>}
      {!error && notes === null && <div className="notesnap-status">Loading…</div>}
      {!error && notes !== null && notes.length === 0 && (
        <div className="notesnap-status">No notes yet — generate one from a video.</div>
      )}

      {!error && notes !== null && notes.length > 0 && (
        <ul className="notesnap-library-list">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                className="notesnap-library-item"
                onClick={() => onSelect(note)}
                disabled={note.status !== 'ready'}
              >
                <span className="notesnap-library-item-title">{note.video_title || '(untitled)'}</span>
                <span className="notesnap-library-item-meta">
                  {formatDate(note.created_at)}
                  {STATUS_LABEL[note.status] && ` · ${STATUS_LABEL[note.status]}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
