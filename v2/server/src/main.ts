/**
 * The server's entry: settings, logger, start; a clean stop on SIGINT/SIGTERM.
 * `bun run dev` (watching) or `bun run start`; bundled for the VPS with `bun run build`.
 */
import { readConfig } from './config.ts';
import { createLog } from './log.ts';
import { startServer } from './server.ts';

const config = readConfig();
const log = createLog({ port: config.port, appDir: config.appDir, dataDir: config.dataDir });
const server = await startServer(config, log);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.stop();
    await log.stop(signal.toLowerCase());
    process.exit(0);
  });
}
