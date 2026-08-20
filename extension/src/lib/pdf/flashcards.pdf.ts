import type { NoteContent } from '../../types/note-content';
import { createDoc, getContentWidth, getMargin } from './shared/doc-helpers';
import { formatTimestampForPdf } from './shared/timestamp-format';

// MVP-SPEC §2.5: two-column table, front | back | timestamp, printable and
// cut-able into physical cards.
export function exportFlashcardsPdf(content: NoteContent): ReturnType<typeof createDoc>['doc'] {
  const { doc } = createDoc();
  const margin = getMargin();
  const contentWidth = getContentWidth();
  const rowHeight = 12;
  const colFront = contentWidth * 0.4;
  const colBack = contentWidth * 0.4;
  const colTs = contentWidth * 0.2;
  let y = margin;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`${content.video.title || 'Video'} — Flashcards`, margin, y);
  y += 10;

  function drawHeaderRow() {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.rect(margin, y, contentWidth, rowHeight);
    doc.line(margin + colFront, y, margin + colFront, y + rowHeight);
    doc.line(margin + colFront + colBack, y, margin + colFront + colBack, y + rowHeight);
    doc.text('Front', margin + 2, y + 7);
    doc.text('Back', margin + colFront + 2, y + 7);
    doc.text('Time', margin + colFront + colBack + 2, y + 7);
    y += rowHeight;
  }

  drawHeaderRow();

  doc.setFont('helvetica', 'normal');
  for (const card of content.flashcards) {
    if (y + rowHeight > 297 - margin) {
      doc.addPage();
      y = margin;
      drawHeaderRow();
      doc.setFont('helvetica', 'normal');
    }
    doc.rect(margin, y, contentWidth, rowHeight);
    doc.line(margin + colFront, y, margin + colFront, y + rowHeight);
    doc.line(margin + colFront + colBack, y, margin + colFront + colBack, y + rowHeight);
    doc.setFontSize(8);
    const frontLines = doc.splitTextToSize(card.front, colFront - 4) as string[];
    const backLines = doc.splitTextToSize(card.back, colBack - 4) as string[];
    doc.text(frontLines.slice(0, 2), margin + 2, y + 5);
    doc.text(backLines.slice(0, 2), margin + colFront + 2, y + 5);
    const tsLines = doc.splitTextToSize(formatTimestampForPdf(card.t_s).replace(/[[\]]/g, ''), colTs - 4) as string[];
    doc.text(tsLines, margin + colFront + colBack + 2, y + 7);
    y += rowHeight;
  }

  return doc;
}
