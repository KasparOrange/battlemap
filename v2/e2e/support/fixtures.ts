/**
 * Playwright fixtures for battlemap flows: `import { test, expect } from './support/fixtures.ts'`.
 *
 * - `table` — a TV page + one companion page + the bot on a fresh table of the shared server.
 * - `privateServer` — a server of the test's own (free port, temp `DATA_DIR`), stopped after.
 * - `privateTable` — like `table`, on `privateServer` (for tests that stop the server or need an
 *   empty library / backups).
 *
 * On failure the bot's last messages are attached (`bot-recent.json`) and, for a private server,
 * its output (`server.log`) — readable from the trace folder, not printed.
 */
import { test as base, expect } from '@playwright/test';
import { startTestServer, type TestServer } from './server.ts';
import { openTable, type Table } from './table.ts';

/** The fixtures. */
export interface BattlemapFixtures {
  /** A table on the shared server. */
  table: Table;
  /** A private server. */
  privateServer: TestServer;
  /** A table on the private server. */
  privateTable: Table;
}

/** `test` with the battlemap fixtures. */
export const test = base.extend<BattlemapFixtures>({
  table: async ({ browser }, use, info) => {
    const t = await openTable(browser);
    await use(t);
    if (info.status !== info.expectedStatus) await info.attach('bot-recent.json', { body: JSON.stringify(t.bot.recent.slice(-80), null, 1), contentType: 'application/json' });
    await t.close();
  },
  privateServer: async ({}, use, info) => {
    const s = await startTestServer();
    await use(s);
    if (info.status !== info.expectedStatus) await info.attach('server.log', { body: s.output(), contentType: 'text/plain' });
    await s.stop();
  },
  privateTable: async ({ browser, privateServer }, use, info) => {
    const t = await openTable(browser, { serverUrl: privateServer.url });
    await use(t);
    if (info.status !== info.expectedStatus) await info.attach('bot-recent.json', { body: JSON.stringify(t.bot.recent.slice(-80), null, 1), contentType: 'application/json' });
    await t.close();
  },
});

export { expect };
