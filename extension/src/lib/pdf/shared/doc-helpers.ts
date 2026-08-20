import { jsPDF } from 'jspdf';

const MARGIN = 15;
const PAGE_WIDTH = 210; // A4 mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 5.5;
const PAGE_HEIGHT = 297;

export interface PdfCursor {
  doc: jsPDF;
  y: number;
}

export function createDoc(): PdfCursor {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  return { doc, y: MARGIN };
}

function ensureSpace(cursor: PdfCursor, needed: number): void {
  if (cursor.y + needed > PAGE_HEIGHT - MARGIN) {
    cursor.doc.addPage();
    cursor.y = MARGIN;
  }
}

export function addTitle(cursor: PdfCursor, text: string): void {
  ensureSpace(cursor, 10);
  cursor.doc.setFontSize(16);
  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.text(text, MARGIN, cursor.y);
  cursor.y += 10;
}

export function addHeading(cursor: PdfCursor, text: string): void {
  ensureSpace(cursor, 8);
  cursor.doc.setFontSize(12);
  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.text(text, MARGIN, cursor.y);
  cursor.y += 7;
}

export function addBody(cursor: PdfCursor, text: string, options?: { indent?: number }): void {
  const indent = options?.indent ?? 0;
  cursor.doc.setFontSize(10);
  cursor.doc.setFont('helvetica', 'normal');
  const lines = cursor.doc.splitTextToSize(text, CONTENT_WIDTH - indent) as string[];
  for (const line of lines) {
    ensureSpace(cursor, LINE_HEIGHT);
    cursor.doc.text(line, MARGIN + indent, cursor.y);
    cursor.y += LINE_HEIGHT;
  }
}

export function addSpacer(cursor: PdfCursor, mm = 4): void {
  cursor.y += mm;
}

export function getContentWidth(): number {
  return CONTENT_WIDTH;
}

export function getMargin(): number {
  return MARGIN;
}
