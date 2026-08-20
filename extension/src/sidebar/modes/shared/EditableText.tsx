import { useState } from 'react';

interface EditableTextProps {
  value: string;
  onSave: (newValue: string) => void;
  onDelete?: () => void;
  multiline?: boolean;
}

// ACCOUNTS-AND-STORAGE-SPEC §4: click any bullet/paragraph/card/term to edit
// its text (contenteditable-style), a delete (x) affordance per item. No
// rich-text toolbar, no drag-reorder. Edits mutate in-memory state
// immediately (feels instant); note-store's mutate actions set the dirty
// flag that lib/sync.ts watches.
export function EditableText({ value, onSave, onDelete, multiline }: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  if (editing) {
    return (
      <div className="notesnap-editable notesnap-editable--active">
        {multiline ? (
          <textarea
            className="notesnap-editable-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            autoFocus
            rows={4}
          />
        ) : (
          <input
            className="notesnap-editable-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            autoFocus
          />
        )}
      </div>
    );
  }

  return (
    <span className="notesnap-editable" onClick={() => setEditing(true)}>
      {value}
      {onDelete && (
        <button
          type="button"
          className="notesnap-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete"
        >
          ×
        </button>
      )}
    </span>
  );
}
