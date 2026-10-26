/**
 * Renders a PDF page in the PDF worker (`pdf-worker.ts`, qa#28): pdf.js parses and draws there,
 * the page only receives the finished bitmap. One worker per page render, ended afterwards, so
 * pdf.js and the document's memory go back to the tablet at once.
 *
 * Browsers without OffscreenCanvas in workers (older Safari) get `null` from
 * {@link renderPdfPageOffThread}; `pdf.ts` then draws on the page as before.
 */
import { ImportError } from './errors.ts';
import type { PdfJob, PdfReply } from './pdf-worker.ts';

/** Marks the PDF worker's own reply: pdf.js posts to the page from that worker too (`pdf-worker.ts`). */
export const PDF_REPLY = 'bm-pdf-reply';

/** What {@link renderPdfPageOffThread} gives back. */
export interface OffThreadPage {
  /** The page's pixels (transfer it, or close it). */
  bitmap: ImageBitmap;
  /** Pages in the document. */
  pageCount: number;
}

/** Whether this browser can draw a PDF in a worker (module workers + OffscreenCanvas 2D). */
export function canRenderOffThread(): boolean {
  return typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof OffscreenCanvas.prototype.transferToImageBitmap === 'function';
}

/**
 * Opens the PDF and draws one page at 4096 px on the long side, in a worker.
 *
 * @param file - the PDF
 * @param pageNumber - the page, from 1 (clamped into the document)
 * @returns the bitmap and the page count, or null when this browser can't draw in a worker (draw on the page then)
 * @throws ImportError `pdf` when pdf.js can't open or draw it (password, damage)
 */
export async function renderPdfPageOffThread(file: Blob, pageNumber: number): Promise<OffThreadPage | null> {
  if (!canRenderOffThread()) return null;
  const bytes = await file.arrayBuffer();
  let worker: Worker;
  try {
    worker = new Worker(new URL('./pdf-worker.ts', import.meta.url), { type: 'module', name: 'pdf' });
  } catch {
    return null;
  }
  const reply = await new Promise<PdfReply | null>((resolve) => {
    // only this worker's reply: pdf.js inside it posts its own `ready` to the page too
    worker.onmessage = (e: MessageEvent<PdfReply | unknown>) => {
      if ((e.data as PdfReply | null)?.tag === PDF_REPLY) resolve(e.data as PdfReply);
    };
    // a worker that can't load (no module workers) or dies: draw on the page instead
    worker.onerror = (e) => {
      e.preventDefault();
      resolve(null);
    };
    const job: PdfJob = { bytes, page: pageNumber };
    worker.postMessage(job, [bytes]);
  }).finally(() => worker.terminate());
  if (!reply) return null;
  if (reply.ok) return { bitmap: reply.bitmap, pageCount: reply.pageCount };
  if (reply.stage === 'open') {
    const message = reply.name === 'PasswordException'
      ? 'This PDF is protected by a password. Save it without one first.'
      : 'Could not render this PDF — it is damaged or not a PDF.';
    throw new ImportError('pdf', message, `${reply.name}: ${reply.message}`);
  }
  throw new ImportError('pdf', 'Could not render this PDF.', `${reply.name}: ${reply.message}`);
}
