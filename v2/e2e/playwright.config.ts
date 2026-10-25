/**
 * Playwright config for the end-to-end flows: the server and the app are started unless they
 * already run; tests are `*.e2e.ts` (so `bun test` never picks them up).
 *
 * The app is **built once per run** into a private dir (`$TMPDIR/claude-v2-e2e-app-<port>`) and
 * served by the run's server at `/app/`, as in production. The Vite dev server reloads every page
 * whenever any file changes — with several helpers editing at once that destroyed pages in the
 * middle of flows ("execution context was destroyed", ws proxy resets). `BATTLEMAP_E2E_DEV=1`
 * uses the dev server instead (on `BATTLEMAP_APP_PORT`), for a quick loop on one's own changes.
 *
 * The shared server gets a fresh temp `DATA_DIR` per run (`$TMPDIR/claude-v2-e2e-data-<port>`,
 * emptied at start), so games, library and files of one run never leak into the next. Tests that
 * need their own server use the `privateServer` fixture (`support/fixtures.ts`).
 *
 * Traces and screenshots of failures stay on disk under `$TMPDIR/claude-v2-e2e-results-<app port>/`, the JSON
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
/** Use the Vite dev server (hot reload) instead of a build served by the server. */
const DEV = process.env.BATTLEMAP_E2E_DEV === '1';
const APP_DIR = join(tmpdir(), `claude-v2-e2e-app-${SERVER_PORT}`);
const SERVER_ENV = { PORT: String(SERVER_PORT), DATA_DIR, ...(DEV ? {} : { APP_DIR }) };
const APP_ENV = { BATTLEMAP_APP_PORT: String(APP_PORT), BATTLEMAP_SERVER: `http://localhost:${SERVER_PORT}` };
/** Where pages load the app from. */
const APP_ORIGIN = `http://localhost:${DEV ? APP_PORT : SERVER_PORT}`;
// `exec`, so the server is the process Playwright stops at the end — through `bun run` it was a
// grandchild that outlived the run, and the next run reused it with the old build.
const SERVER_CMD = `rm -rf "${DATA_DIR}" && cd ../server && exec bun src/main.ts`;
const BUILD_CMD = `rm -rf "${APP_DIR}" && (cd ../app && bunx vite build --outDir "${APP_DIR}" --logLevel warn)`;
/** Reuse a server already on the port only in dev mode — a built run always builds fresh. */
const REUSE = DEV;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  // Per app port, so parallel runs of other helpers never clean or overwrite this run's results.
  reporter: [['list'], ['json', { outputFile: `../test-results/e2e-report-${APP_PORT}.json` }]],
  // Artifacts live in the temp dir: other helpers' runs clean `test-results/` while this one is
  // still writing its traces there (ENOENT on trace files).
  outputDir: join(tmpdir(), `claude-v2-e2e-results-${APP_PORT}`),
  // Each test makes its own table, so files run in parallel; the TV pages draw with WebGL, so
  // not too many at once.
  workers: Number(process.env.BATTLEMAP_E2E_WORKERS ?? 2),
  use: {
    baseURL: APP_ORIGIN,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // WebGL in headless Chromium without a GPU: SwiftShader.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: DEV
    ? [
        { command: SERVER_CMD, url: `http://localhost:${SERVER_PORT}/health`, env: SERVER_ENV, reuseExistingServer: true, timeout: 20_000 },
        { command: 'bun run --cwd ../app dev', url: `http://localhost:${APP_PORT}/app/`, env: APP_ENV, reuseExistingServer: true, timeout: 30_000 },
      ]
    : [
        // Build first, then serve build + server from one process; ready when the app answers.
        { command: `${BUILD_CMD} && ${SERVER_CMD}`, url: `http://localhost:${SERVER_PORT}/app/`, env: SERVER_ENV, reuseExistingServer: REUSE, timeout: 240_000 },
      ],
});
