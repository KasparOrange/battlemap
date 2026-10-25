/**
 * Playwright config for the end-to-end flows: the server (5929) and the app's dev server (5884)
 * are started unless they already run; tests are `*.e2e.ts` (so `bun test` never picks them up).
 */
import { defineConfig } from '@playwright/test';

/** Ports: `BATTLEMAP_APP_PORT` / `BATTLEMAP_SERVER_PORT` let parallel helpers run their own pair. */
const APP_PORT = Number(process.env.BATTLEMAP_APP_PORT ?? 5884);
const SERVER_PORT = Number(process.env.BATTLEMAP_SERVER_PORT ?? 5929);
const SERVER_ENV = { PORT: String(SERVER_PORT) };
const APP_ENV = { BATTLEMAP_APP_PORT: String(APP_PORT), BATTLEMAP_SERVER: `http://localhost:${SERVER_PORT}` };

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  reporter: 'list',
  use: { baseURL: `http://localhost:${APP_PORT}`, headless: true },
  webServer: [
    { command: 'bun run --cwd ../server start', url: `http://localhost:${SERVER_PORT}/health`, env: SERVER_ENV, reuseExistingServer: true, timeout: 20_000 },
    { command: 'bun run --cwd ../app dev', url: `http://localhost:${APP_PORT}/app/`, env: APP_ENV, reuseExistingServer: true, timeout: 30_000 },
  ],
});
