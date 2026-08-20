import type { NoteContent } from '../../types/note-content';
import { createDoc, addTitle, addHeading, addBody, addSpacer } from './shared/doc-helpers';
import { formatTimestampForPdf } from './shared/timestamp-format';

// MVP-SPEC §2.1: full document, timestamps printed as [12:40–18:05].
export function exportLectureNotesPdf(content: NoteContent): jsPDFDoc {
  const cursor = createDoc();
  addTitle(cursor, content.video.title || 'Lecture Notes');

  for (const section of content.sections) {
    const ts = formatTimestampForPdf(section.start_s, section.end_s);
    addHeading(cursor, ts ? `${section.title} ${ts}` : section.title);
    // content_md may contain light markdown syntax; PDF export renders it as
    // plain text (jsPDF has no markdown renderer) — acceptable per MVP-SPEC,
    // which only requires "full-sentence explanations", not styled markdown.
    addBody(cursor, stripMarkdown(section.content_md));
    for (const sub of section.subsections) {
      const subTs = formatTimestampForPdf(sub.start_s);
      addBody(cursor, subTs ? `• ${sub.title} ${subTs}` : `• ${sub.title}`, { indent: 4 });
    }
    addSpacer(cursor);
  }

  addHeading(cursor, 'Summary');
  addBody(cursor, content.summary.overview);

  return cursor.doc;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?|```/g, ''))
    .replace(/[*_`#]+/g, '')
    .trim();
}

type jsPDFDoc = ReturnType<typeof createDoc>['doc'];
