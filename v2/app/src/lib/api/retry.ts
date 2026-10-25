/**
 * Retry with backoff for API calls: tries again on errors that may pass (no connection, a
 * timeout, a 5xx while the server restarts), never on a 4xx, an invalid answer or a cancel.
 */
import type { Logger } from '../log.ts';
import { ApiError } from './errors.ts';

/** How often and how long to wait. */
export interface RetryPolicy {
  /** Attempts in total (1 = no retry). */
  attempts: number;
  /** Waits before the 2nd, 3rd, … attempt in ms; the last one repeats. */
  backoffMs: readonly number[];
}

/** The default: four attempts, 1 s, 2 s, 4 s apart. */
export const DEFAULT_RETRY: RetryPolicy = { attempts: 4, backoffMs: [1000, 2000, 4000] };

/** Waits, or rejects with an aborted `ApiError` when the signal fires. */
function sleep(ms: number, path: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError('aborted', 'Cancelled', path));
      return;
    }
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new ApiError('aborted', 'Cancelled', path)); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Runs `attempt` until it succeeds, fails for good, or the attempts run out.
 *
 * @param what - names the call in log lines ("Upload")
 * @param path - the request path, for log lines and errors
 * @param attempt - one try; gets the attempt number from 1
 * @param policy - attempts and waits
 * @param log - the logger
 * @param signal - cancels the waits too
 * @returns what the successful attempt returned
 * @throws the last error
 */
export async function withRetry<T>(
  what: string,
  path: string,
  attempt: (n: number) => Promise<T>,
  policy: RetryPolicy,
  log: Logger,
  signal?: AbortSignal,
): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt(n);
    } catch (err) {
      if (!(err instanceof ApiError) || !err.retryable || signal?.aborted || n >= policy.attempts) throw err;
      const wait = policy.backoffMs[Math.min(n - 1, policy.backoffMs.length - 1)] ?? 1000;
      log.warn('api', `${what} failed — retrying`, { path, attempt: n, of: policy.attempts, waitMs: wait, kind: err.kind, status: err.status, error: err.message });
      await sleep(wait, path, signal);
    }
  }
}
