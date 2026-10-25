/**
 * The server's settings, from the environment with development defaults.
 *
 * | Variable | Default | What |
 * |---|---|---|
 * | `PORT` | 5929 | HTTP + WebSocket port |
 * | `HOST` | `0.0.0.0` | interface to listen on |
 * | `APP_DIR` | `../app/dist` | the built app, served at `/app/` |
 * | `DATA_DIR` | `./data` | files, library, game backups (later packages) |
 */
import { resolve } from 'node:path';

/** The server's settings. */
export interface ServerConfig {
  /** Port (0 = any free one, for tests). */
  port: number;
  /** Interface to listen on. */
  host: string;
  /** The built app (`app/dist`), served at `/app/`. */
  appDir: string;
  /** Where the server keeps its data. */
  dataDir: string;
  /** How long a new socket may take to say `hello`, ms. */
  helloTimeoutMs: number;
  /** How often `build.json` is re-read to notice a new app build, ms (0 = never). */
  buildPollMs: number;
}

/** The server's own folder (`v2/server`). */
const SERVER_DIR = resolve(import.meta.dir, '..');

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
  };
}
