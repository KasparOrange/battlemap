/**
 * The settings `run.ts` starts the two servers with, which the suite relies on. Kept apart from
 * `lib.ts` (which needs `SERVER_URL`) so the runner can import them.
 */

/** The main server's settings the suite relies on (run.ts starts it with these). */
export const MAIN = {
  /** `HELLO_TIMEOUT_MS`. */
  helloTimeoutMs: 300,
  /** `MAX_UPLOAD_BYTES`: 2 MiB. */
  maxUploadBytes: 2 * 1024 * 1024,
  /** `MAX_GAME_BYTES`: 1 MiB. */
  maxGameBytes: 1024 * 1024,
  /** `FETCH_TIMEOUT_MS`. */
  fetchTimeoutMs: 1_500,
  /** `CLEANUP_EVERY_MS`. */
  cleanupEveryMs: 1_000,
  /** `BUILD_POLL_MS`. */
  buildPollMs: 200,
} as const;

/** The tight server's relay limits (run.ts). */
export const TIGHT_LIMITS = {
  helloTimeoutMs: 500,
  zombieMs: 300,
  sweepMs: 50,
  ratePerS: 10,
  rateBurst: 5,
  rateCloseAfter: 15,
  companionsPerRoom: 2,
  maxRooms: 3,
  waitingPerIp: 2,
  maxFrameBytes: 64 * 1024,
} as const;
