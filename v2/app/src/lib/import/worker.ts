/**
 * The import worker's entry: takes a `WorkerRequest`, runs the matching `prepare.ts` job with
 * the browser's picture engine, reports each step, answers with the result or the error. All
 * the heavy work of an import (JSON parse and base64 of a 30 MB `.dd2vtt`, decoding, grid
 * detection, scaling, encoding) happens here, off the main thread.
 *
 * Started by `worker-client.ts` with `new Worker(new URL('./worker.ts', import.meta.url))`,
 * which Vite bundles on its own (no config needed).
 */
import { ImportError } from './errors.ts';
import { preparePdfPage, preparePicture, prepareUvtt, remakeTableCopy } from './prepare.ts';
import { BitmapImage, browserBackend } from './raster-browser.ts';
import type { WorkerReply, WorkerRequest } from './worker-protocol.ts';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: WorkerReply): void;
};

const now = () => performance.now();

scope.onmessage = (e) => {
  const req = e.data;
  const step = (s: Parameters<Parameters<typeof prepareUvtt>[2]>[0]) => scope.postMessage({ id: req.id, type: 'step', step: s });
  const job = async () => {
    switch (req.op) {
      case 'uvtt':
        return prepareUvtt(req.file, browserBackend, step, now);
      case 'picture':
        return preparePicture(req.file, req.name, browserBackend, step, now);
      case 'pdfPage': {
        const page = new BitmapImage(req.bitmap);
        try {
          return await preparePdfPage(page, req.name, browserBackend, step, now);
        } finally {
          page.close();
        }
      }
      case 'tableCopy':
        return remakeTableCopy(req.picture, req.grid, browserBackend);
    }
  };
  job().then(
    (result) => scope.postMessage({ id: req.id, type: 'done', result }),
    (err: unknown) => {
      const error = err instanceof ImportError
        ? { code: err.code, message: err.message, detail: err.detail }
        : { code: 'internal' as const, message: 'The import stopped with an internal error.', detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
      scope.postMessage({ id: req.id, type: 'error', error });
    },
  );
};
