/**
 * PDF page 1 → a bitmap, with pdf.js. Loaded lazily (pdf.js is ~1 MB; only an import of a PDF
 * pays for it). pdf.js parses in its own worker (its URL resolved by Vite under the app's base
 * `/app/`) and renders onto a canvas in slices of a few ms, so the main thread stays free; the
 * bitmap then goes to the import worker (transferred). The TV never sees a PDF.
 *
 * @see ./sizing.ts pdfRenderScale — the long side becomes 4096 px, as in v1
 */
import { ImportError } from './errors.ts';
import { pdfRenderScale } from './sizing.ts';

/** A rendered first page. */
export interface RenderedPage {
  /** The page's pixels (transfer it, or close it). */
  bitmap: ImageBitmap;
  /** Pages in the document (only the first is used). */
  pageCount: number;
}

/**
 * Renders a PDF's first page at 4096 px on the long side.
 *
 * @param file - the PDF
 * @returns the bitmap and the page count
 * @throws ImportError `pdf` when pdf.js can't open or render it (password, damage)
 */
export async function renderPdfFirstPage(file: Blob): Promise<RenderedPage> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (e) {
    void task.destroy();
    const name = e instanceof Error ? e.name : '';
    const message = name === 'PasswordException'
      ? 'This PDF is protected by a password. Save it without one first.'
      : 'Could not render this PDF — it is damaged or not a PDF.';
    throw new ImportError('pdf', message, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: pdfRenderScale(base.width, base.height) });
    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);
    // An OffscreenCanvas hands its pixels over without a copy (transferToImageBitmap); a DOM
    // canvas needs a read-back on the main thread, which took ~80 ms for a 4096 px page.
    const offscreen = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : null;
    const canvas = offscreen ? null : Object.assign(document.createElement('canvas'), { width, height });
    const ctx = (offscreen ?? canvas!).getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx) throw new ImportError('pdf', "This device can't draw the PDF (no canvas).");
    try {
      await page.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' }).promise;
      const bitmap = offscreen ? offscreen.transferToImageBitmap() : await createImageBitmap(canvas!);
      return { bitmap, pageCount: doc.numPages };
    } finally {
      if (canvas) {
        canvas.width = 0; // gives the canvas memory back at once (Safari keeps it otherwise)
        canvas.height = 0;
      }
      page.cleanup();
    }
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError('pdf', 'Could not render this PDF.', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  } finally {
    void task.destroy(); // ends the document and pdf.js's worker
  }
}
