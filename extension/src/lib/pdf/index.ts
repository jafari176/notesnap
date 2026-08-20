import type { NoteContent } from '../../types/note-content';
import { exportLectureNotesPdf } from './lecture-notes.pdf';
import { exportCheatsheetPdf } from './cheatsheet.pdf';
import { exportSummaryPdf } from './summary.pdf';
import { exportOutlinePdf } from './outline.pdf';
import { exportFlashcardsPdf } from './flashcards.pdf';
import { exportPracticeQuestionsPdf } from './practice-questions.pdf';
import { exportEli5Pdf } from './eli5.pdf';
import { exportMindMapPdf } from './mind-map.pdf';

function downloadPdf(doc: { save: (filename: string) => void }, filename: string): void {
  doc.save(filename);
}

function safeFilename(title: string, suffix: string): string {
  const base = (title || 'notesnap-video').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60);
  return `${base}-${suffix}.pdf`;
}

// 7 of 8 modes are synchronous jsPDF text layouts with an identical
// signature. Mind Map is the deliberate exception — it needs the live SVG
// element from MindMapView (a DOM node, not derivable from `content` alone)
// and is async because rasterizing SVG->PNG is inherently async. Callers
// must branch on mode id for mind-map specifically; every other mode goes
// through this dispatch table uniformly.
const SYNC_EXPORTERS: Record<string, (content: NoteContent) => { save: (filename: string) => void }> = {
  'lecture-notes': exportLectureNotesPdf,
  cheatsheet: exportCheatsheetPdf,
  summary: exportSummaryPdf,
  outline: exportOutlinePdf,
  flashcards: exportFlashcardsPdf,
  'practice-questions': exportPracticeQuestionsPdf,
  eli5: exportEli5Pdf,
};

export function exportModePdf(modeId: string, content: NoteContent): void {
  const exporter = SYNC_EXPORTERS[modeId];
  if (!exporter) {
    throw new Error(`No PDF exporter for mode "${modeId}" — mind-map must call exportMindMapPdfAndDownload directly`);
  }
  const doc = exporter(content);
  downloadPdf(doc, safeFilename(content.video.title, modeId));
}

export async function exportMindMapPdfAndDownload(content: NoteContent, svgElement: SVGSVGElement): Promise<void> {
  const doc = await exportMindMapPdf(content, svgElement);
  downloadPdf(doc, safeFilename(content.video.title, 'mind-map'));
}
