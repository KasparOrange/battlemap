/**
 * Import errors: one class with a reason code (for logs and tests) and a message written for
 * the DM (the companion shows it as a notice as is).
 */

/** Why an import failed. */
export type ImportErrorCode =
  /** Not a kind of file battlemap reads (by name and content). */
  | 'unsupported'
  /** The file has no bytes (an iCloud/Drive file that wasn't downloaded). */
  | 'empty'
  /** Over a size limit (bytes or pixels). */
  | 'too-big'
  /** The file is damaged or not what its name says. */
  | 'corrupt'
  /** pdf.js couldn't open or render the PDF. */
  | 'pdf'
  /** The browser couldn't decode or encode the picture. */
  | 'picture'
  /** Uploading a file to the server failed. */
  | 'upload'
  /** The worker died or isn't available. */
  | 'internal';

/** An import that failed, with a message the DM can read. */
export class ImportError extends Error {
  /**
   * @param code - the reason
   * @param message - what the DM reads ("This .dd2vtt file is damaged: …")
   * @param detail - extra context for the log (not shown)
   */
  constructor(readonly code: ImportErrorCode, message: string, readonly detail?: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/**
 * Wraps anything thrown into an `ImportError` (an `ImportError` passes through).
 *
 * @param e - what was thrown
 * @param code - the code for anything else
 * @param message - the DM's message for anything else
 * @returns the import error
 */
export function asImportError(e: unknown, code: ImportErrorCode, message: string): ImportError {
  if (e instanceof ImportError) return e;
  return new ImportError(code, message, e instanceof Error ? e.message : String(e));
}
