/**
 * Playwright config for the end-to-end flows: the server and the app's dev server are started
 * unless they already run; tests are `*.e2e.ts` (so `bun test` never picks them up).
 *
 * The shared server gets a fresh temp `DATA_DIR` per run (`$TMPDIR/claude-v2-e2e-data-<port>`,
 * emptied at start), so games, library and files of one run never leak into the next. Tests that
 * need their own server use the `privateServer` fixture (`support/fixtures.ts`).
 *
 * Traces and screenshots of failures stay on disk under `test-results/e2e-<app port>/`, the JSON
 * report in `test-results/e2e-report-<app port>.json` (never printed);
 * open one with `bunx playwright show-trace <path>/trace.zip`.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

/** Ports: `BATTLEMAP_APP_PORT` / `BATTLEMAP_SERVER_PORT` let parallel helpers run their own pair. */
const APP_PORT = Number(process.env.BATTLEMAP_APP_PORT ?? 5884);
const SERVER_PORT = Number(process.env.BATTLEMAP_SERVER_PORT ?? 5929);
const DATA_DIR = join(tmpdir(), `claude-v2-e2e-data-${SERVER_PORT}`);
const SERVER_ENV = { PORT: String(SERVER_PORT), DATA_DIR };
const APP_ENV = { BATTLEMAP_APP_PORT: String(APP_PORT), BATTLEMAP_SERVER: `http://localhost:${SERVER_PORT}` };

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  // Per app port, so parallel runs of other helpers never clean or overwrite this run's results.
  reporter: [['list'], ['json', { outputFile: `../test-results/e2e-report-${APP_PORT}.json` }]],
  outputDir: `../test-results/e2e-${APP_PORT}`,
  // Each test makes its own table, so files run in parallel; the TV pages draw with WebGL, so
  // not too many at once.
  workers: Number(process.env.BATTLEMAP_E2E_WORKERS ?? 2),
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // WebGL in headless Chromium without a GPU: SwiftShader.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: [
    { command: `rm -rf "${DATA_DIR}" && bun run --cwd ../server start`, url: `http://localhost:${SERVER_PORT}/health`, env: SERVER_ENV, reuseExistingServer: true, timeout: 20_000 },
    { command: 'bun run --cwd ../app dev', url: `http://localhost:${APP_PORT}/app/`, env: APP_ENV, reuseExistingServer: true, timeout: 30_000 },
  ],
});
