import type { NoteContent } from '../../types/note-content';
import { createDoc, addTitle, addBody } from './shared/doc-helpers';
import { formatTimestampForPdf } from './shared/timestamp-format';

// MVP-SPEC §2.3: half-page, mainly useful as the top of a shared note.
export function exportSummaryPdf(content: NoteContent): ReturnType<typeof createDoc>['doc'] {
  const cursor = createDoc();
  addTitle(cursor, content.video.title || 'Summary');
  addBody(cursor, content.summary.overview);
  for (const t of content.summary.takeaways) {
    addBody(cursor, `• ${t.text} ${formatTimestampForPdf(t.t_s)}`);
  }
  return cursor.doc;
}
