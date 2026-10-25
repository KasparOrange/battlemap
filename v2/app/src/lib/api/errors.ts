/**
 * The one error type of the server API client. `kind` says what went wrong and whether a retry
 * can help; a cancelled request is an `ApiError` named `AbortError`, so callers can treat it like
 * a cancelled `fetch` (`err.name === 'AbortError'`).
 */

/** What went wrong. */
export type ApiErrorKind =
  /** No answer: offline, DNS, connection refused or reset. Retried. */
  | 'network'
  /** No progress for too long. Retried. */
  | 'timeout'
  /** The server answered with an error status (`status`). 5xx and 429 are retried, other 4xx not. */
  | 'http'
  /** The answer was not what the API promises (bad JSON, failed schema check). Not retried. */
  | 'invalid'
  /** The caller cancelled. Never retried. */
  | 'aborted';

/** A failed API call. */
export class ApiError extends Error {
  /** What went wrong. */
  readonly kind: ApiErrorKind;
  /** The HTTP status for `http`, else 0. */
  readonly status: number;
  /** The request's URL (without the server part). */
  readonly path: string;

  /**
   * @param kind - what went wrong
   * @param message - for logs and notices
   * @param path - the request's path
   * @param status - the HTTP status, 0 when there was none
   */
  constructor(kind: ApiErrorKind, message: string, path: string, status = 0) {
    super(message);
    this.name = kind === 'aborted' ? 'AbortError' : 'ApiError';
    this.kind = kind;
    this.status = status;
    this.path = path;
  }

  /** Whether trying again may succeed. */
  get retryable(): boolean {
    if (this.kind === 'network' || this.kind === 'timeout') return true;
    return this.kind === 'http' && (this.status >= 500 || this.status === 429 || this.status === 408);
  }
}

/**
 * A short sentence for a notice ("Upload failed: no connection to the server.").
 *
 * @param err - what was thrown
 * @returns the reason in plain words
 */
export function describeError(err: unknown): string {
  if (!(err instanceof ApiError)) return err instanceof Error ? err.message : String(err);
  switch (err.kind) {
    case 'network': return 'no connection to the server';
    case 'timeout': return 'the server stopped answering';
    case 'aborted': return 'cancelled';
    case 'invalid': return 'the server sent something unexpected';
    case 'http': return err.status === 404 ? 'not found on the server' : err.status === 413 ? 'the file is too big for the server' : `the server said ${err.message}`;
  }
}
