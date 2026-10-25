/**
 * Playwright config for the end-to-end flows: the server (5929) and the app's dev server (5884)
 * are started unless they already run; tests are `*.e2e.ts` (so `bun test` never picks them up).
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5884', headless: true },
  webServer: [
    { command: 'bun run --cwd ../server start', url: 'http://localhost:5929/health', reuseExistingServer: true, timeout: 20_000 },
    { command: 'bun run --cwd ../app dev', url: 'http://localhost:5884/app/', reuseExistingServer: true, timeout: 30_000 },
  ],
});
