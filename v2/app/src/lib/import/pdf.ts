/**
 * PDF pages → bitmaps, with pdf.js: the picked page at full size for the import, and small
 * thumbnails of every page for the page picker (`pdfPageThumbs`). Loaded lazily (pdf.js is ~1 MB; only an import of a PDF
 * pays for it). The import's page is drawn in the PDF worker (`pdf-offthread.ts`, qa#28: on the
 * page single drawing steps ran 55–143 ms); where a browser can't draw in a worker, pdf.js parses in
 * its own worker (its URL resolved by Vite under the app's base `/app/`) and draws here in slices.
 * The bitmap then goes to the import worker (transferred). The TV never sees a PDF.
 *
 * @see ./sizing.ts pdfRenderScale — the long side becomes 4096 px, as in v1
 */
import { ImportError } from './errors.ts';
import { pdfRenderScale } from './sizing.ts';
import { renderPdfPageOffThread } from './pdf-offthread.ts';

/** A rendered first page. */
export interface RenderedPage {
  /** The page's pixels (transfer it, or close it). */
  bitmap: ImageBitmap;
  /** Pages in the document. */
  pageCount: number;
}

/** pdf.js, loaded on first use, with its worker set. */
async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/**
 * Opens a PDF with pdf.js.
 *
 * @param file - the PDF
 * @returns the loading task (destroy it when done) and the document
 * @throws ImportError `pdf` when pdf.js can't open it (password, damage)
 */
async function openPdf(file: Blob) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    return { task, doc: await task.promise };
  } catch (e) {
    void task.destroy();
    const name = e instanceof Error ? e.name : '';
    const message = name === 'PasswordException'
      ? 'This PDF is protected by a password. Save it without one first.'
      : 'Could not render this PDF — it is damaged or not a PDF.';
    throw new ImportError('pdf', message, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

/**
 * Renders a PDF's first page at 4096 px on the long side.
 *
 * @param file - the PDF
 * @returns the bitmap and the page count
 * @throws ImportError `pdf` when pdf.js can't open or render it (password, damage)
 * @see renderPdfPage for any other page
 */
export function renderPdfFirstPage(file: Blob): Promise<RenderedPage> {
  return renderPdfPage(file, 1);
}

/**
 * Renders one page of a PDF at 4096 px on the long side.
 *
 * @param file - the PDF
 * @param pageNumber - the page, from 1 (clamped into the document)
 * @returns the bitmap and the page count
 * @throws ImportError `pdf` when pdf.js can't open or render it (password, damage)
 */
export async function renderPdfPage(file: Blob, pageNumber: number): Promise<RenderedPage> {
  // qa#28: pdf.js draws in a worker where the browser can (no long tasks on the page)
  const off = await renderPdfPageOffThread(file, pageNumber);
  if (off) return off;
  const { task, doc } = await openPdf(file);
  try {
    const page = await doc.getPage(Math.min(doc.numPages, Math.max(1, Math.round(pageNumber))));
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

/** Pages the picker shows at most (a rulebook has hundreds; maps are rarely past this). */
export const MAX_PICKER_PAGES = 60;

/** The thumbnails of a PDF's pages, for the page picker. */
export interface PdfThumbs {
  /** Pages in the document. */
  pageCount: number;
  /** One small JPEG per page, page 1 first (at most `MAX_PICKER_PAGES`). */
  thumbs: Blob[];
}

/**
 * Renders small thumbnails of a PDF's pages (long side `side` px), one page at a time so only
 * one small canvas is alive. Cheap next to the real render: a 240 px page is ~1/300 of 4096 px.
 *
 * @param file - the PDF
 * @param side - long side of a thumbnail in px
 * @param onPage - called after each page (done, total) for a progress bar
 * @returns the page count and the thumbnails
 * @throws ImportError `pdf` when pdf.js can't open it
 */
export async function pdfPageThumbs(file: Blob, side = 240, onPage?: (done: number, total: number) => void): Promise<PdfThumbs> {
  const { task, doc } = await openPdf(file);
  try {
    const total = Math.min(doc.numPages, MAX_PICKER_PAGES);
    const thumbs: Blob[] = [];
    for (let n = 1; n <= total; n++) {
      const page = await doc.getPage(n);
      try {
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: side / Math.max(base.width, base.height) });
        const canvas = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.floor(viewport.width)), height: Math.max(1, Math.floor(viewport.height)) });
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new ImportError('pdf', "This device can't draw the PDF (no canvas).");
        await page.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' }).promise;
        thumbs.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new ImportError('pdf', 'Could not draw a page preview.'))), 'image/jpeg', 0.8)));
        canvas.width = 0;
        canvas.height = 0;
      } finally {
        page.cleanup();
      }
      onPage?.(n, total);
    }
    return { pageCount: doc.numPages, thumbs };
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError('pdf', 'Could not render this PDF.', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  } finally {
    void task.destroy();
  }
}
