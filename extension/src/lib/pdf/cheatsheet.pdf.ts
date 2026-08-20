import type { NoteContent } from '../../types/note-content';
import { createDoc, addTitle, addHeading, addBody, addSpacer } from './shared/doc-helpers';
import { formatTimestampForPdf } from './shared/timestamp-format';

// MVP-SPEC §2.2: dense revision sheet, target 1 page (2 max), timestamp
// printed inline after each line, e.g. "Osmosis: ... [14:22]". Full
// two-column layout is a nice-to-have not required by the spec text
// ("dense", not "columnar") — single-column dense list meets the
// requirement without the added layout complexity of real column-flow.
export function exportCheatsheetPdf(content: NoteContent): ReturnType<typeof createDoc>['doc'] {
  const cursor = createDoc();
  addTitle(cursor, `${content.video.title || 'Video'} — Cheatsheet`);

  if (content.cheatsheet.key_terms.length > 0) {
    addHeading(cursor, 'Key Terms');
    for (const t of content.cheatsheet.key_terms) {
      addBody(cursor, `${t.term}: ${t.definition_one_line} ${formatTimestampForPdf(t.t_s)}`);
    }
    addSpacer(cursor);
  }

  if (content.cheatsheet.formulas.length > 0) {
    addHeading(cursor, 'Formulas');
    for (const f of content.cheatsheet.formulas) {
      const note = f.note ? ` — ${f.note}` : '';
      addBody(cursor, `${f.name}: ${f.expression}${note} ${formatTimestampForPdf(f.t_s)}`);
    }
    addSpacer(cursor);
  }

  if (content.cheatsheet.core_concepts.length > 0) {
    addHeading(cursor, 'Core Concepts');
    for (const c of content.cheatsheet.core_concepts) {
      addBody(cursor, `${c.text} ${formatTimestampForPdf(c.t_s)}`);
    }
    addSpacer(cursor);
  }

  if (content.cheatsheet.exam_traps.length > 0) {
    addHeading(cursor, 'Exam Traps');
    for (const e of content.cheatsheet.exam_traps) {
      addBody(cursor, `${e.text} ${formatTimestampForPdf(e.t_s)}`);
    }
  }

  return cursor.doc;
}
