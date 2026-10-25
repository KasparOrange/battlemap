/**
 * Starts the Bun server (`../server/src`, unchanged) the way the contract needs it: every
 * setting from the environment, like the Rust server reads them (docs/server-rs.md
 * "settings") — the Bun server's own `main.ts` only reads `PORT`, `HOST`, `APP_DIR`, `DATA_DIR`.
 *
 * With `BATTLEMAP_FETCH_TEST_ADDR` set, requests of the link fetch to names under `.test` go to
 * that address instead (the Rust server's test resolver does the same): the downloader's own
 * code — redirects, caps, timeouts, the address guard for every other name — stays in charge.
 *
 * Run by `run.ts`; stops cleanly on SIGTERM/SIGINT like `main.ts`.
 */
import http from 'node:http';
import { readConfig, type ServerConfig } from '../server/src/config.ts';
import { createLog } from '../server/src/log.ts';
import { startServer } from '../server/src/server.ts';

const env = process.env;

/** A number from the environment, or the default. */
function num(name: string, fallback: number): number {
  const v = env[name];
  return v === undefined || v === '' ? fallback : Number(v);
}

const base = readConfig();
const config: ServerConfig = {
  ...base,
  helloTimeoutMs: num('HELLO_TIMEOUT_MS', base.helloTimeoutMs),
  buildPollMs: num('BUILD_POLL_MS', base.buildPollMs),
  maxUploadBytes: num('MAX_UPLOAD_BYTES', base.maxUploadBytes),
  maxGameBytes: num('MAX_GAME_BYTES', base.maxGameBytes),
  gameVersions: num('GAME_VERSIONS', base.gameVersions),
  fetchTimeoutMs: num('FETCH_TIMEOUT_MS', base.fetchTimeoutMs),
  cleanupEveryMs: num('CLEANUP_EVERY_MS', base.cleanupEveryMs),
  relay: {
    zombieMs: num('RELAY_ZOMBIE_MS', base.relay.zombieMs),
    sweepMs: num('RELAY_SWEEP_MS', base.relay.sweepMs),
    ratePerS: num('RELAY_RATE_PER_S', base.relay.ratePerS),
    rateBurst: num('RELAY_RATE_BURST', base.relay.rateBurst),
    rateCloseAfter: num('RELAY_RATE_CLOSE_AFTER', base.relay.rateCloseAfter),
    companionsPerRoom: num('RELAY_COMPANIONS_PER_ROOM', base.relay.companionsPerRoom),
    maxRooms: num('RELAY_MAX_ROOMS', base.relay.maxRooms),
    waitingPerIp: num('RELAY_WAITING_PER_IP', base.relay.waitingPerIp),
    maxBufferedBytes: num('RELAY_MAX_BUFFERED_BYTES', base.relay.maxBufferedBytes),
    maxFrameBytes: num('RELAY_MAX_FRAME_BYTES', base.relay.maxFrameBytes),
  },
};

const testAddr = env.BATTLEMAP_FETCH_TEST_ADDR;
if (testAddr) {
  const original = http.request.bind(http);
  // download.ts calls `http.request(url, options, callback)` with a URL object.
  (http as { request: unknown }).request = (url: URL, options: http.RequestOptions, cb: (res: http.IncomingMessage) => void) => {
    if (url instanceof URL && url.hostname.endsWith('.test')) {
      const to = new URL(url);
      to.hostname = testAddr;
      const { lookup: _lookup, ...rest } = options;
      return original(to, { ...rest, headers: { ...rest.headers, host: url.host } }, cb);
    }
    return original(url, options, cb);
  };
}

const log = createLog({ port: config.port, appDir: config.appDir, dataDir: config.dataDir, launcher: 'server-contract' });
const server = await startServer(config, log);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.stop();
    await log.stop(signal.toLowerCase());
    process.exit(0);
  });
}
