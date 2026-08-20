import type { NoteContent } from '../../types/note-content';
import { createDoc, addTitle, addHeading, addBody, addSpacer } from './shared/doc-helpers';
import { formatTimestampForPdf } from './shared/timestamp-format';

// MVP-SPEC §2.8: same layout as Lecture Notes export, just simpler prose,
// same timestamp formatting — reads content_eli5_md instead of content_md.
export function exportEli5Pdf(content: NoteContent): ReturnType<typeof createDoc>['doc'] {
  const cursor = createDoc();
  addTitle(cursor, `${content.video.title || 'Video'} (Simplified)`);

  for (const section of content.sections) {
    const ts = formatTimestampForPdf(section.start_s, section.end_s);
    addHeading(cursor, ts ? `${section.title} ${ts}` : section.title);
    addBody(cursor, section.content_eli5_md.replace(/[*_`#]+/g, ''));
    addSpacer(cursor);
  }

  return cursor.doc;
}
