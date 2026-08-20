import type { NoteContent } from '../../types/note-content';
import { createDoc, addTitle, getContentWidth, getMargin } from './shared/doc-helpers';

// MVP-SPEC §2.6: rendered as a static image (canvas snapshot of the laid-out
// tree), vector fidelity is a nice-to-have not required for MVP. This is the
// one PDF export that isn't a jsPDF text layout like the other 7 — it takes
// the already-rendered SVG element from the DOM (MindMapView) rather than
// recomputing the layout, so the exported image always matches exactly what
// the user saw on screen.
export async function exportMindMapPdf(content: NoteContent, svgElement: SVGSVGElement): Promise<ReturnType<typeof createDoc>['doc']> {
  const cursor = createDoc();
  addTitle(cursor, `${content.video.title || 'Video'} — Mind Map`);

  const pngDataUrl = await svgElementToPngDataUrl(svgElement);
  const contentWidth = getContentWidth();
  const margin = getMargin();

  const svgWidth = svgElement.width.baseVal.value || svgElement.getBoundingClientRect().width;
  const svgHeight = svgElement.height.baseVal.value || svgElement.getBoundingClientRect().height;
  const aspectRatio = svgHeight / svgWidth;
  const imgWidth = contentWidth;
  const imgHeight = imgWidth * aspectRatio;

  cursor.doc.addImage(pngDataUrl, 'PNG', margin, cursor.y, imgWidth, imgHeight);
  return cursor.doc;
}

function svgElementToPngDataUrl(svg: SVGSVGElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const width = svg.width.baseVal.value || svg.getBoundingClientRect().width;
    const height = svg.height.baseVal.value || svg.getBoundingClientRect().height;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // 2x scale for print-quality output from a screen-resolution SVG.
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not get canvas context'));
        return;
      }
      // Mind map is dark-themed on screen; white background for print legibility.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to rasterize mind map SVG'));
    };
    img.src = url;
  });
}
