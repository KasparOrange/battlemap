/**
 * The PDF worker (qa#28): pdf.js opens the document and draws the page here, onto an
 * OffscreenCanvas, so none of its work lands on the tablet's main thread. pdf.js on the page
 * kept its parsing in its own worker but drew on the main thread — single drawing steps (a big
 * embedded picture scaled onto the 4096 px canvas) ran 55–143 ms, past the 50 ms long-task budget.
 *
 * Without a document pdf.js needs three stand-ins: canvases are OffscreenCanvases
 * ({@link OffscreenCanvasFactory}), the SVG filters it builds for a few blend effects are left out
 * ({@link NoFilterFactory}: drawn without them), and fonts are drawn as outlines from the font
 * program (`disableFontFace`) instead of being installed as web fonts.
 *
 * pdf.js can't start its own nested worker from here (it reads `window.location`), so it parses
 * in this worker ("fake worker"): it imports its worker code, which hooks itself onto this
 * worker's port and posts a `ready` message to the page. The page therefore takes only messages
 * tagged {@link PDF_REPLY}.
 *
 * Started by `pdf-offthread.ts`, one job per worker. Request: {@link PdfJob}; reply:
 * {@link PdfReply} (the bitmap transferred).
 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { pdfRenderScale } from './sizing.ts';
import { PDF_REPLY } from './pdf-offthread.ts';

/** What the page asks for. */
export interface PdfJob {
  /** The PDF's bytes (transferred). */
  bytes: ArrayBuffer;
  /** The page, from 1 (clamped into the document). */
  page: number;
}

/** What the worker answers. */
export type PdfReply = { tag: typeof PDF_REPLY } & (
  | { ok: true; bitmap: ImageBitmap; pageCount: number }
  /** `open`: pdf.js couldn't open it (`name` is pdf.js' error name, e.g. `PasswordException`); `render`: drawing failed. */
  | { ok: false; stage: 'open' | 'render'; name: string; message: string }
);

/** pdf.js' canvas factory interface, with OffscreenCanvases. */
class OffscreenCanvasFactory {
  /** @param width - px @param height - px @returns a canvas and its 2D context */
  create(width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext('2d', { willReadFrequently: false }) };
  }
  /** Resizes a canvas from {@link OffscreenCanvasFactory.create}. */
  reset(cc: { canvas: OffscreenCanvas | null }, width: number, height: number) {
    if (!cc.canvas) throw new Error('Canvas is not specified');
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    cc.canvas.width = width;
    cc.canvas.height = height;
  }
  /** Frees a canvas from {@link OffscreenCanvasFactory.create}. */
  destroy(cc: { canvas: OffscreenCanvas | null; context: unknown }) {
    if (!cc.canvas) throw new Error('Canvas is not specified');
    cc.canvas.width = cc.canvas.height = 0;
    cc.canvas = null;
    cc.context = null;
  }
}

/** pdf.js' filter factory without a DOM: every filter is "none" (pdf.js' own base behaviour). */
class NoFilterFactory {
  addFilter() {
    return 'none';
  }
  addHCMFilter() {
    return 'none';
  }
  addAlphaFilter() {
    return 'none';
  }
  addLuminosityFilter() {
    return 'none';
  }
  addKnockoutFilter() {
    return 'none';
  }
  addHighlightHCMFilter() {
    return 'none';
  }
  addSelectionHCMFilter() {
    return 'none';
  }
  addSelectionFilter() {
    return 'none';
  }
  createSelectionStyle() {
    return 'none';
  }
  destroy() {}
}

GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Opens the PDF and draws the page at 4096 px on the long side.
 *
 * @param job - the bytes and the page
 * @returns the reply to post
 */
async function render(job: PdfJob): Promise<PdfReply> {
  const tag = PDF_REPLY;
  const task = getDocument({
    data: new Uint8Array(job.bytes),
    CanvasFactory: OffscreenCanvasFactory,
    FilterFactory: NoFilterFactory,
    isOffscreenCanvasSupported: true,
    disableFontFace: true,
    useSystemFonts: false,
  } as Parameters<typeof getDocument>[0]);
  try {
    let doc: Awaited<typeof task.promise>;
    try {
      doc = await task.promise;
    } catch (e) {
      return { tag, ok: false, stage: 'open', name: e instanceof Error ? e.name : '', message: e instanceof Error ? e.message : String(e) };
    }
    try {
      const page = await doc.getPage(Math.min(doc.numPages, Math.max(1, Math.round(job.page))));
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: pdfRenderScale(base.width, base.height) });
      const canvas = new OffscreenCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2D context');
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport, background: '#ffffff' }).promise;
      page.cleanup();
      return { tag, ok: true, bitmap: canvas.transferToImageBitmap(), pageCount: doc.numPages };
    } catch (e) {
      return { tag, ok: false, stage: 'render', name: e instanceof Error ? e.name : '', message: e instanceof Error ? e.message : String(e) };
    }
  } finally {
    void task.destroy();
  }
}

self.onmessage = (e: MessageEvent<PdfJob>) => {
  void render(e.data).then((reply) => {
    if (reply.ok) (self as unknown as Worker).postMessage(reply, [reply.bitmap]);
    else (self as unknown as Worker).postMessage(reply);
  });
};
