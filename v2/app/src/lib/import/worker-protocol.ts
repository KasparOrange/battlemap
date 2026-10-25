/**
 * The messages between the main thread and the import worker. Files travel as `Blob`s (a handle,
 * not a copy) and a rendered PDF page as a transferred `ImageBitmap`, so nothing big is copied
 * on the main thread.
 */
import type { RasterGrid } from '@battlemap/shared';
import type { ImportErrorCode } from './errors.ts';
import type { ImportStep, Prepared, PreparedFile } from './prepare.ts';

/** A job for the worker. */
export type WorkerRequest =
  /** Prepare a `.dd2vtt` / `.uvtt`. */
  | { id: number; op: 'uvtt'; file: Blob }
  /** Prepare a picture. */
  | { id: number; op: 'picture'; file: Blob; name: string }
  /** Prepare a rendered PDF page (the bitmap is transferred). */
  | { id: number; op: 'pdfPage'; bitmap: ImageBitmap; name: string }
  /** Make a table copy for a new grid. */
  | { id: number; op: 'tableCopy'; picture: Blob; grid: RasterGrid };

/** An error as it crosses the worker boundary. */
export interface WorkerError {
  /** The import error's code. */
  code: ImportErrorCode;
  /** The DM's message. */
  message: string;
  /** Context for the log. */
  detail?: string;
}

/** What the worker sends back. */
export type WorkerReply =
  /** A step started. */
  | { id: number; type: 'step'; step: ImportStep }
  /** The job is done (`Prepared` for the prepare jobs, `PreparedFile | null` for `tableCopy`). */
  | { id: number; type: 'done'; result: Prepared | PreparedFile | null }
  /** The job failed. */
  | { id: number; type: 'error'; error: WorkerError };
