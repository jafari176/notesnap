import type { NoteContent } from '../../types/note-content';
import { createDoc, addTitle, addHeading, addBody, addSpacer } from './shared/doc-helpers';
import { formatTimestampForPdf } from './shared/timestamp-format';

// MVP-SPEC §2.7: questions on their own page(s), answer key on a final page
// with timestamps — so it can be torn off / hidden while self-testing.
export function exportPracticeQuestionsPdf(content: NoteContent): ReturnType<typeof createDoc>['doc'] {
  const cursor = createDoc();
  addTitle(cursor, `${content.video.title || 'Video'} — Practice Questions`);

  content.practice_questions.forEach((q, i) => {
    addBody(cursor, `${i + 1}. ${q.question}`);
    if (q.type === 'mcq') {
      q.options.forEach((opt, oi) => addBody(cursor, `   ${String.fromCharCode(65 + oi)}. ${opt}`, { indent: 4 }));
    }
    addSpacer(cursor, 3);
  });

  cursor.doc.addPage();
  cursor.y = 15;
  addHeading(cursor, 'Answer Key');
  content.practice_questions.forEach((q, i) => {
    addBody(cursor, `${i + 1}. ${q.answer} ${formatTimestampForPdf(q.t_s)}`);
    if (q.explanation) addBody(cursor, q.explanation, { indent: 4 });
    addSpacer(cursor, 2);
  });

  return cursor.doc;
}
