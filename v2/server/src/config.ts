/**
 * The server's settings, from the environment with development defaults, and the limits that
 * keep one misbehaving client from hurting the others.
 *
 * | Variable | Default | What |
 * |---|---|---|
 * | `PORT` | 5929 | HTTP + WebSocket port |
 * | `HOST` | `0.0.0.0` | interface to listen on |
 * | `APP_DIR` | `../app/dist` | the built app, served at `/app/` |
 * | `DATA_DIR` | `./data` | files, shared library, game backups, temporary uploads |
 */
import { resolve } from 'node:path';

/** Limits of the relay (per socket and per room). */
export interface RelayLimits {
  /** A socket that sent nothing (not even a ping) for this long is closed as a zombie, ms. */
  zombieMs: number;
  /** How often the relay looks for zombies and slow consumers, ms. */
  sweepMs: number;
  /** Messages per second a socket may send on average (token bucket refill). */
  ratePerS: number;
  /** Messages a socket may send in one burst (token bucket size). */
  rateBurst: number;
  /** A socket that had this many messages dropped for its rate within a minute is closed. */
  rateCloseAfter: number;
  /** Companions per room. */
  companionsPerRoom: number;
  /** Rooms on the server. */
  maxRooms: number;
  /** Sockets that haven't said hello yet, per address. */
  waitingPerIp: number;
  /** Bytes queued for one socket before it is closed as too slow. */
  maxBufferedBytes: number;
  /** Largest frame, bytes (Bun closes the socket on a bigger one). */
  maxFrameBytes: number;
}

/** The server's settings. */
export interface ServerConfig {
  /** Port (0 = any free one, for tests). */
  port: number;
  /** Interface to listen on. */
  host: string;
  /** The built app (`app/dist`), served at `/app/`. */
  appDir: string;
  /** Where the server keeps its data (`files/`, `library.json`, `games/`, `uploads/`, `trash/`). */
  dataDir: string;
  /** How long a new socket may take to say `hello`, ms. */
  helloTimeoutMs: number;
  /** How often `build.json` is re-read to notice a new app build, ms (0 = never). */
  buildPollMs: number;
  /** Largest upload (`POST /files`) and link download, bytes. */
  maxUploadBytes: number;
  /** Largest game backup (`PUT /api/games/<id>`), bytes. */
  maxGameBytes: number;
  /** Previous versions kept per game backup. */
  gameVersions: number;
  /** Link fetch: time allowed per socket operation, ms. */
  fetchTimeoutMs: number;
  /** Temporary uploads (link fetches) are removed after this many days. */
  uploadMaxAgeDays: number;
  /** Deleted game backups stay in `trash/` this many days. */
  trashMaxAgeDays: number;
  /** How often the cleanup runs, ms (0 = only at start). */
  cleanupEveryMs: number;
  /** A request slower than this is logged as slow, ms. */
  slowMs: number;
  /** The relay's limits. */
  relay: RelayLimits;
}

/** The server's own folder (`v2/server`). */
const SERVER_DIR = resolve(import.meta.dir, '..');

/** The relay limits in production. */
export const RELAY_LIMITS: RelayLimits = {
  zombieMs: 45_000,
  sweepMs: 5_000,
  ratePerS: 100,
  rateBurst: 400,
  rateCloseAfter: 2_000,
  companionsPerRoom: 16,
  maxRooms: 1_000,
  waitingPerIp: 20,
  maxBufferedBytes: 32 * 1024 * 1024,
  maxFrameBytes: 16 * 1024 * 1024,
};

/**
 * Reads the settings.
 *
 * @param env - the environment (default `process.env`)
 * @returns the settings
 */
export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 5929),
    host: env.HOST ?? '0.0.0.0',
    appDir: resolve(SERVER_DIR, env.APP_DIR ?? '../app/dist'),
    dataDir: resolve(SERVER_DIR, env.DATA_DIR ?? './data'),
    helloTimeoutMs: 8_000,
    buildPollMs: 10_000,
    maxUploadBytes: 200 * 1024 * 1024,
    maxGameBytes: 25 * 1024 * 1024,
    gameVersions: 10,
    fetchTimeoutMs: 30_000,
    uploadMaxAgeDays: 7,
    trashMaxAgeDays: 30,
    cleanupEveryMs: 6 * 3600_000,
    slowMs: 1_000,
    relay: { ...RELAY_LIMITS },
  };
}
