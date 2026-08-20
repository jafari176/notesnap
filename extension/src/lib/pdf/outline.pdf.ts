import type { NoteContent } from '../../types/note-content';
import { createDoc, addTitle, addBody } from './shared/doc-helpers';
import { formatTimestampForPdf } from './shared/timestamp-format';

// MVP-SPEC §2.4: single-column nested list, very short, no body text.
export function exportOutlinePdf(content: NoteContent): ReturnType<typeof createDoc>['doc'] {
  const cursor = createDoc();
  addTitle(cursor, `${content.video.title || 'Video'} — Outline`);
  for (const section of content.sections) {
    addBody(cursor, `${section.title} ${formatTimestampForPdf(section.start_s)}`);
    for (const sub of section.subsections) {
      addBody(cursor, `• ${sub.title} ${formatTimestampForPdf(sub.start_s)}`, { indent: 6 });
    }
  }
  return cursor.doc;
}
