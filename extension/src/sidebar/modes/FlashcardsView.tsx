import { useState } from 'react';
import type { ModeViewProps } from './shared/modeRegistry';
import { TimestampChip } from '../components/TimestampChip';
import { EditableText } from './shared/EditableText';
import { useNoteStore } from '../state/note-store';

// MVP-SPEC §2.5: flip-card viewer with prev/next, timestamp chip visible on
// the back ("Jump to source"). No SRS scheduling in this build — that's a
// deferred fast-follow, this is a clean viewer only.
export function FlashcardsView({ content }: ModeViewProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const mutateContent = useNoteStore((s) => s.mutateContent);
  const cards = content.flashcards;

  if (cards.length === 0) {
    return <p className="notesnap-placeholder">No flashcards generated for this video.</p>;
  }

  const card = cards[Math.min(index, cards.length - 1)];

  function goTo(newIndex: number) {
    setIndex(Math.max(0, Math.min(cards.length - 1, newIndex)));
    setFlipped(false);
  }

  function editField(field: 'front' | 'back', value: string) {
    mutateContent((c) => ({
      ...c,
      flashcards: c.flashcards.map((fc) => (fc.uid === card.uid ? { ...fc, [field]: value } : fc)),
    }));
  }

  function deleteCard() {
    mutateContent((c) => ({ ...c, flashcards: c.flashcards.filter((fc) => fc.uid !== card.uid) }));
    goTo(Math.min(index, cards.length - 2));
  }

  return (
    <div className="notesnap-mode-content">
      <div className="notesnap-flashcard">
        <div className="notesnap-flashcard-face" onClick={() => setFlipped((f) => !f)}>
          {flipped ? (
            <EditableText value={card.back} onSave={(v) => editField('back', v)} />
          ) : (
            <EditableText value={card.front} onSave={(v) => editField('front', v)} />
          )}
        </div>
        {flipped && (
          <div className="notesnap-flashcard-source">
            <TimestampChip t_s={card.t_s} label="Jump to source" />
          </div>
        )}
        <button type="button" className="notesnap-delete-btn notesnap-delete-btn--card" onClick={deleteCard} aria-label="Delete card">
          ×
        </button>
      </div>
      <div className="notesnap-flashcard-nav">
        <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0}>
          ‹ Prev
        </button>
        <span className="notesnap-flashcard-counter">
          {index + 1} / {cards.length}
        </span>
        <button type="button" onClick={() => goTo(index + 1)} disabled={index === cards.length - 1}>
          Next ›
        </button>
      </div>
    </div>
  );
}
