import type { ModeViewProps } from './shared/modeRegistry';
import { TimestampChip } from '../components/TimestampChip';
import { EditableText } from './shared/EditableText';
import { useNoteStore } from '../state/note-store';

export function SummaryView({ content }: ModeViewProps) {
  const mutateContent = useNoteStore((s) => s.mutateContent);

  function editTakeaway(uid: string, text: string) {
    mutateContent((c) => ({
      ...c,
      summary: { ...c.summary, takeaways: c.summary.takeaways.map((t) => (t.uid === uid ? { ...t, text } : t)) },
    }));
  }

  function deleteTakeaway(uid: string) {
    mutateContent((c) => ({
      ...c,
      summary: { ...c.summary, takeaways: c.summary.takeaways.filter((t) => t.uid !== uid) },
    }));
  }

  return (
    <div className="notesnap-mode-content">
      <p className="notesnap-section-body">{content.summary.overview}</p>
      <ul className="notesnap-subsection-list">
        {content.summary.takeaways.map((t) => (
          <li key={t.uid}>
            <TimestampChip t_s={t.t_s} />
            <EditableText value={t.text} onSave={(v) => editTakeaway(t.uid, v)} onDelete={() => deleteTakeaway(t.uid)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
