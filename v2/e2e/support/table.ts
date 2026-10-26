/**
 * Multi-page table flows: one TV page plus companion pages (and a protocol-level bot) on one
 * table, against the run's shared server or a private one.
 *
 * Reading state: through the app's test hook `window.__battlemap` when the page has it (see
 * {@link BattlemapHook}, enabled by `?debug=1`), else through what the pages already show (the
 * TV's `tv-status` debug line, the companion's `companion-status`) and — for the TV's full
 * authoritative state — through the bot's `sync.request` → `sync.snapshot`, which needs no hook.
 */
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { newId, type Command, type RootState } from '../../shared/src/index.ts';
import { ProtoClient, type Snapshot } from './proto.ts';

/** Ports of this run (`BATTLEMAP_APP_PORT` / `BATTLEMAP_SERVER_PORT`, as `playwright.config.ts`). */
export const APP_PORT = Number(process.env.BATTLEMAP_APP_PORT ?? 5884);
/** The shared server's port. */
export const SERVER_PORT = Number(process.env.BATTLEMAP_SERVER_PORT ?? 5929);
/** The shared server's base URL. */
export const SERVER_URL = `http://localhost:${SERVER_PORT}`;

/**
 * The test hook the app is asked to expose on `window.__battlemap` when the page runs with
 * `?debug=1` (specified by QA in `docs/qa.md` "test hook"; optional — every helper falls back
 * when it is missing). All methods are synchronous and return plain JSON-able data.
 */
export interface BattlemapHook {
  /** `tv` or `companion`. */
  mode: 'tv' | 'companion';
  /** This page's client id. */
  client: string;
  /** The connection's state (`open`, `connecting`, `replaced`, …). */
  connection(): string;
  /** TV: the authoritative state; companion: what it shows (confirmed + pending). */
  state(): RootState | null;
  /** The confirmed revision. */
  rev(): number;
  /** The epoch. */
  epoch(): string | null;
  /** Companion: commands sent and not yet echoed. */
  pending?(): number;
  /** Companion: the session's `dispatch` (prediction, offline rule and all). */
  dispatch?(cmd: Command): boolean;
  /** Either mode: send a request (`game.open`, `lib.list`, …). */
  request?(msg: { type: string } & Record<string, unknown>): boolean;
  /** The last notices shown (newest last). */
  notices?(): { text: string; kind: string; at: number }[];
  /** TV: renderer counters — frames drawn so far, textures held. */
  render?(): { frames: number; textures: number; textureBytes: number } | null;
  /** TV: whether a reload now reopens what the table shows (saved + the device's last game). */
  stored?(): boolean | null;
}

/**
 * Waits until a reload of the TV page would reopen what it shows — the open game saved on the
 * device and remembered as its last one (the hook's `stored()`, qa#34/#35). Wait on this before
 * a reload instead of sleeping past the autosave.
 *
 * @param tv - the TV page (runs with `?debug=1`)
 * @param timeoutMs - how long to wait
 */
export async function waitStored(tv: Page, timeoutMs = 20_000): Promise<void> {
  await expect.poll(() => tv.evaluate(() => (window as unknown as { __battlemap?: BattlemapHook }).__battlemap?.stored?.() ?? null), {
    timeout: timeoutMs, message: 'the TV never had its game stored for a reload',
  }).toBe(true);
}

/** A TV page, companion pages and a bot on one table. */
export interface Table {
  /** The table (room) id. */
  id: string;
  /** The browser context of the pages (one storage, like one device per page would not be). */
  context: BrowserContext;
  /** The TV page. */
  tv: Page;
  /** Companion pages (possibly none). */
  companions: Page[];
  /** A protocol-level companion: sends commands, reads the TV's state. */
  bot: ProtoClient;
  /** The server's base URL the pages use. */
  serverUrl: string;
  /** Closes the pages and the bot. */
  close(): Promise<void>;
}

/** Options of {@link openTable}. */
export interface TableOptions {
  /** Companion pages to open (default 1). */
  companions?: number;
  /** A private server's base URL (default: the run's shared server via the app's proxy). */
  serverUrl?: string;
  /** Extra query for the TV page (e.g. `&name=Box`). */
  tvQuery?: string;
  /** TV viewport (default 1920 × 1080, the box's render size). */
  tvViewport?: { width: number; height: number };
  /** Companion viewport (default the Tab A11+'s 1340 × 800 landscape in CSS px). */
  companionViewport?: { width: number; height: number };
}

/**
 * The page URL of a mode on a table.
 *
 * @param mode - `tv` or `companion`
 * @param table - the table id
 * @param serverUrl - a private server, else none (the page's own origin, proxied)
 * @param extra - more query
 * @returns a path for `page.goto`
 */
export function appUrl(mode: 'tv' | 'companion', table: string, serverUrl?: string, extra = ''): string {
  const server = serverUrl ? `&server=${encodeURIComponent(serverUrl)}` : '';
  return `/app/?mode=${mode}&table=${table}&debug=1${server}${extra}`;
}

/**
 * Whether the page exposes the test hook.
 *
 * @param page - a TV or companion page
 * @returns true when `window.__battlemap` exists
 */
export async function hasHook(page: Page): Promise<boolean> {
  return page.evaluate(() => typeof (window as unknown as { __battlemap?: unknown }).__battlemap === 'object');
}

/**
 * The state a page holds (TV: authoritative; companion: its prediction), through the hook.
 *
 * @param page - the page
 * @returns the state, or undefined when the page has no hook
 */
export async function pageState(page: Page): Promise<RootState | null | undefined> {
  return page.evaluate(() => (window as unknown as { __battlemap?: BattlemapHook }).__battlemap?.state());
}

/**
 * A page's confirmed revision: from the hook, else from its debug line (`rev N`).
 *
 * @param page - the page
 * @returns the revision, or null when neither is there
 */
export async function pageRev(page: Page): Promise<number | null> {
  const viaHook = await page.evaluate(() => (window as unknown as { __battlemap?: BattlemapHook }).__battlemap?.rev() ?? null);
  if (viaHook !== null) return viaHook;
  const line = await page.getByTestId(/^(tv|companion)-status$/).first().textContent({ timeout: 1000 }).catch(() => null);
  const m = line?.match(/rev (\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Waits until the TV page is connected to its table.
 *
 * @param tv - the TV page
 */
export async function waitTvOnline(tv: Page): Promise<void> {
  await expect.poll(async () => {
    const viaHook = await tv.evaluate(() => (window as unknown as { __battlemap?: BattlemapHook }).__battlemap?.connection() ?? null);
    if (viaHook !== null) return viaHook;
    const line = await tv.getByTestId('tv-status').textContent({ timeout: 500 }).catch(() => '');
    return line?.trim().split(' ')[0] ?? '';
  }, { timeout: 15_000, message: 'TV page never connected' }).toBe('open');
}

/**
 * Opens a table: the TV page first (it must be in the room before companions ask for a
 * snapshot), then the bot, then companion pages; waits until every companion has the TV's state.
 *
 * @param browser - Playwright's browser
 * @param opts - companions, server, viewports
 * @returns the table; call `close()` at the end
 */
export async function openTable(browser: Browser, opts: TableOptions = {}): Promise<Table> {
  const id = `e2e-${newId(8)}`;
  const context = await browser.newContext({ viewport: opts.tvViewport ?? { width: 1920, height: 1080 } });
  const tv = await context.newPage();
  await tv.goto(appUrl('tv', id, opts.serverUrl, opts.tvQuery ?? '&name=e2e%20TV'));
  await waitTvOnline(tv);

  const serverUrl = opts.serverUrl ?? SERVER_URL;
  const bot = new ProtoClient({ wsUrl: `${serverUrl.replace(/^http/, 'ws')}/ws`, room: id, name: 'e2e bot' });
  await bot.connect();
  await bot.snapshot();

  const companions: Page[] = [];
  for (let i = 0; i < (opts.companions ?? 1); i++) {
    const c = await context.newPage();
    await c.setViewportSize(opts.companionViewport ?? { width: 1340, height: 800 });
    await c.goto(appUrl('companion', id, opts.serverUrl, `&name=e2e%20companion%20${i + 1}`));
    companions.push(c);
  }
  const table: Table = {
    id, context, tv, companions, bot, serverUrl,
    close: async () => {
      bot.close();
      await context.close();
    },
  };
  await waitSynced(table);
  return table;
}

/** A page's revision, or `'busy'` when the page doesn't answer within 3 s (a blocked main thread). */
async function boundedRev(page: Page): Promise<number | null | 'busy'> {
  return Promise.race([pageRev(page), new Promise<'busy'>((r) => setTimeout(() => r('busy'), 3000))]);
}

/**
 * Waits until the TV, the bot and every companion page agree on the revision (and the bot's
 * copy has caught up with a fresh snapshot).
 *
 * @param t - the table
 * @param timeoutMs - how long to wait
 * @returns the TV's snapshot at that point
 */
export async function waitSynced(t: Table, timeoutMs = 20_000): Promise<Snapshot> {
  let snap: Snapshot | null = null;
  let last = 'nothing read yet';
  await expect.poll(async () => {
    snap = await t.bot.snapshot(5000);
    const revs = [await boundedRev(t.tv), t.bot.rev, ...(await Promise.all(t.companions.map(boundedRev)))];
    last = `TV snapshot rev ${snap.rev} epoch ${snap.epoch}; TV page, bot, companions: ${revs.join(', ')}`;
    return revs.every((r) => r === snap!.rev) ? 'synced' : last;
  }, { timeout: timeoutMs, message: 'table did not sync' }).toBe('synced').catch((e: unknown) => {
    throw new Error(`table did not sync — ${last}`, { cause: e });
  });
  return snap!;
}

/**
 * Starts a game on the TV through the bot (`game.new`) and waits for its snapshot.
 *
 * @param t - the table
 * @param name - the game's name
 * @param map - its first map
 * @returns the game id
 */
export async function startGame(t: Table, name: string, map: import('../../shared/src/index.ts').MapInfo): Promise<string> {
  const gameId = newId();
  const snap = t.bot.next((m) => m.type === 'sync.snapshot' && (m.state as RootState).game?.id === gameId, 10_000, 'snapshot of the new game');
  t.bot.send({ type: 'game.new', game: { id: gameId, name, createdAt: new Date().toISOString(), map } });
  await snap;
  return gameId;
}

/**
 * The TV's state as the TV page holds it (hook), else as the TV sends it (bot snapshot).
 *
 * @param t - the table
 * @returns the state
 */
export async function tvState(t: Table): Promise<RootState> {
  const viaHook = await pageState(t.tv);
  if (viaHook) return viaHook;
  return (await t.bot.snapshot()).state;
}

/**
 * The open game's map on the table, from a state.
 *
 * @param s - the state
 * @returns its play state
 * @throws Error when no game is open
 */
export function activeMap(s: RootState): import('../../shared/src/index.ts').MapPlay {
  if (!s.game) throw new Error('no game open');
  const m = s.game.maps[s.game.activeMapId];
  if (!m) throw new Error('active map missing');
  return m;
}
