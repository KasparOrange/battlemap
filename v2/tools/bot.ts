#!/usr/bin/env bun
/**
 * The soak bot — v2's version of the old bench robot (`../../tools/bench_bot.py`): a scripted
 * companion that joins a table over the real protocol and plays a long, random but valid
 * session against the table's TV, then checks that everyone ends up with the same state.
 *
 *   bun v2/tools/bot.ts [options]
 *
 *   --server <url>        the server (default http://localhost:5929)
 *   --table <id>          the table to join (default: a new one; needs --tv launch)
 *   --tv launch|none      launch a headless TV page (default when no --table) or use the TV
 *                         already in the room (an emulator, the box)
 *   --app <url>           where the TV page is served (default <server>/app/ — a built app;
 *                         Vite: http://localhost:5884/app/)
 *   --commands <n>        commands to send (default 500)
 *   --seed <n>            random seed (default: time) — the same seed plays the same session
 *   --reconnect-every <n> drop the socket every n commands and reconnect (default 120, 0 = never)
 *   --tv-reload-every <n> reload the launched TV page every n commands (default 0 = never)
 *   --check-every <n>     convergence check every n commands (default 50)
 *   --map <key>           the fixture map to start on (default lair; e2e/support/maps.ts)
 *   --quiet               no progress lines
 *
 * What it checks:
 * - **Convergence**: its own copy (snapshot + every `sync.applied` folded with the shared reducer)
 *   equals a fresh `sync.snapshot` of the TV — every `--check-every` commands and at the end; with
 *   a launched TV page also the page's own state when the page has the test hook.
 * - **Prediction**: a command the reducer accepts on the bot's copy must not be refused by the TV
 *   (sequential commands only; bursts are skipped for this check).
 * - **Offline rule (L10)**: a command tried while disconnected is not sent, and never shows up
 *   on the TV after the reconnect.
 * - **Order**: revisions of its own applied commands only grow.
 *
 * Logs: MwLog tenant `battlemap`, app `battlemap-v2-bot`, area `bot` (one line per phase, every
 * failure with context, a summary) — `logq battlemap 'app:battlemap-v2-bot'`. Exit code 0 = all
 * checks held, 1 = a check failed, 2 = could not start.
 *
 * Progress prints as `[n/m]` so a background run shows its progress.
 */
import { parseArgs } from 'node:util';
import { apply, buildWallGrid, circleCells, classicDisc, floodFillWithin, newId, type Command, type MapPlay, type RootState } from '../shared/src/index.ts';
import { init } from '../server/node_modules/mwlog/src/index.ts';
import { fixture, uploadMap, type UploadedMap } from '../e2e/support/maps.ts';
import { ProtoClient } from '../e2e/support/proto.ts';

const { values: args } = parseArgs({
  options: {
    server: { type: 'string', default: 'http://localhost:5929' },
    table: { type: 'string' },
    tv: { type: 'string' },
    app: { type: 'string' },
    commands: { type: 'string', default: '500' },
    seed: { type: 'string' },
    'reconnect-every': { type: 'string', default: '120' },
    'tv-reload-every': { type: 'string', default: '0' },
    'check-every': { type: 'string', default: '50' },
    map: { type: 'string', default: 'lair' },
    quiet: { type: 'boolean', default: false },
  },
});

const SERVER = args.server!.replace(/\/$/, '');
const TOTAL = Number(args.commands);
const SEED = Number(args.seed ?? Date.now() % 1_000_000);
const RECONNECT_EVERY = Number(args['reconnect-every']);
const TV_RELOAD_EVERY = Number(args['tv-reload-every']);
const CHECK_EVERY = Number(args['check-every']);
const TABLE = args.table ?? `bot-${newId(8)}`;
const TV_MODE = args.tv ?? (args.table ? 'none' : 'launch');

const log = init({ app: 'battlemap-v2-bot', tenant: 'battlemap', version: '0.1.0', start: { server: SERVER, table: TABLE, seed: SEED, commands: TOTAL } });

/** Prints a progress or result line (stdout) unless quiet. */
function say(line: string): void {
  if (!args.quiet) process.stdout.write(`${line}\n`);
}

// ── a seeded random source (mulberry32), so a seed replays the same session ─────────────────
let rngState = SEED >>> 0;
/** A number in [0, 1). */
function rnd(): number {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** An integer in [0, n). */
function int(n: number): number {
  return Math.floor(rnd() * n);
}
/** One of the items. */
function pick<T>(items: readonly T[]): T {
  return items[int(items.length)]!;
}

/** Structural equality of two JSON values (key order ignored). */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** The first path where two JSON values differ (for the failure line). */
function firstDiff(a: unknown, b: unknown, path = ''): string {
  if (same(a, b)) return '';
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return `${path || '/'}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}/${k}`);
    if (d) return d;
  }
  return path;
}

// ── the command generator ───────────────────────────────────────────────────────────────────

/** Maps uploaded for this session, by id (for room/circle fills and map.add). */
const maps = new Map<string, UploadedMap>();
/** A gesture kept over a few commands (a stroke), and how many commands it still lasts. */
let stroke = { id: newId(), left: 0 };

/** The map on the table in a state. */
function active(s: RootState): MapPlay | null {
  return s.game ? s.game.maps[s.game.activeMapId] ?? null : null;
}

/**
 * A random command that makes sense on this state (most are valid; undo/redo on empty stacks
 * and the like are allowed to be refused).
 *
 * @param s - the bot's confirmed copy
 * @returns the command
 */
async function randomCommand(s: RootState): Promise<Command> {
  const m = active(s)!;
  const { cols, rows } = m.info.grid;
  const col = int(cols);
  const row = int(rows);
  const roll = rnd();
  if (roll < 0.30) {
    if (stroke.left <= 0) stroke = { id: newId(), left: 1 + int(6) };
    stroke.left--;
    return { type: 'fog.apply', cells: circleCells(col, row, int(4), cols, rows), value: rnd() < 0.8 ? 'reveal' : 'hide', gesture: stroke.id };
  }
  if (roll < 0.36) {
    const geo = maps.get(m.info.id)?.geometry;
    if (geo) return { type: 'fog.apply', cells: floodFillWithin(buildWallGrid(cols, rows, geo, m.doorsOpen), row * cols + col, 1 + int(5)), value: 'reveal', gesture: newId() };
    return { type: 'fog.all', value: rnd() < 0.5 ? 'reveal' : 'hide' };
  }
  if (roll < 0.42 && m.info.doorCount > 0) return { type: 'door.set', index: int(m.info.doorCount), open: rnd() < 0.6 };
  if (roll < 0.50) {
    if (m.tokens.length < 3 || (m.tokens.length < 20 && rnd() < 0.2)) {
      return { type: 'token.add', token: { id: newId(), label: `B${m.tokens.length + 1}`, name: `Bot ${m.tokens.length + 1}`, color: pick(['#e53935', '#1e88e5', '#43a047', '#8e24aa']), col, row, placed: rnd() < 0.9, hidden: false } };
    }
    const tk = pick(m.tokens);
    const r = rnd();
    if (r < 0.75) return { type: 'token.move', id: tk.id, col, row, gesture: stroke.id };
    if (r < 0.9) return { type: 'token.update', id: tk.id, hidden: !tk.hidden };
    return { type: 'token.remove', id: tk.id };
  }
  if (roll < 0.56) {
    if (m.strokes.length > 0 && rnd() < 0.25) return { type: 'draw.remove', id: pick(m.strokes).id };
    const pts = Array.from({ length: 2 + int(6) }, () => [rnd() * cols, rnd() * rows]).flat();
    return rnd() < 0.3 ? { type: 'draw.live', stroke: { id: newId(), points: pts, color: '#ffffff', width: 0.1 + rnd() * 0.3 } } : { type: 'draw.add', stroke: { id: newId(), points: pts, color: '#fdd835', width: 0.1 + rnd() * 0.3 } };
  }
  if (roll < 0.60) return { type: 'measure.set', line: rnd() < 0.2 ? null : { a: { x: rnd() * cols, y: rnd() * rows }, b: { x: rnd() * cols, y: rnd() * rows } } };
  if (roll < 0.63) return { type: 'ruler.set', ruler: { visible: rnd() < 0.7, x: col, y: row, rotation: pick([0, 90, 180, 270] as const) } };
  if (roll < 0.67) return { type: 'disc.set', disc: { ...classicDisc(), visible: rnd() < 0.8, x: col + 0.5, y: row + 0.5, rotation: int(360), markers: int(13) } };
  if (roll < 0.74) {
    const r = rnd();
    if (r < 0.4) return { type: 'view.pan', dx: int(5) - 2, dy: int(5) - 2 };
    if (r < 0.6) return { type: 'view.window', col: rnd() < 0.2 ? null : int(cols), row: rnd() < 0.2 ? null : int(rows) };
    if (r < 0.75) return { type: 'view.mode', mode: pick(['table', 'table', 'fit'] as const) };
    if (r < 0.9) return { type: 'view.rotate', quarterTurns: pick([0, 0, 1, 2, 3] as const) };
    return { type: 'view.grid', on: rnd() < 0.7 };
  }
  if (roll < 0.80) return { type: rnd() < 0.6 ? 'history.undo' : 'history.redo' };
  if (roll < 0.84) {
    const r = rnd();
    if (r < 0.3) return { type: 'fog.preview', on: !s.game!.previewFirst };
    if (r < 0.65) return { type: 'fog.commit' };
    return { type: 'fog.discard' };
  }
  if (roll < 0.87) return { type: 'game.settings', settings: { fogEdgeInset: int(46), fogFade: rnd() < 0.5 } };
  if (roll < 0.92 && s.game!.mapOrder.length > 1) return { type: 'map.switch', mapId: pick(s.game!.mapOrder) };
  if (roll < 0.94 && s.game!.mapOrder.length < 4) {
    const u = await uploadMap(SERVER, pick(['towerGround', 'towerUpper', 'house', 'lairImage', 'tavern']));
    maps.set(u.info.id, u);
    return { type: 'map.add', map: u.info, activate: rnd() < 0.5 };
  }
  if (roll < 0.95) return { type: 'table.calibrate', widthInches: 30 + int(20) };
  return { type: 'fog.all', value: 'reveal' };
}

// ── the run ─────────────────────────────────────────────────────────────────────────────────

/** Counters and findings for the summary. */
const result = {
  table: TABLE, seed: SEED, sent: 0, applied: 0, refused: 0, refusedReasons: {} as Record<string, number>,
  predictionMismatches: 0, convergenceChecks: 0, convergenceFailures: 0, reconnects: 0, tvReloads: 0,
  offlineTries: 0, offlineLeaks: 0, orderViolations: 0, rttMs: [] as number[], failures: [] as string[],
};

/** Records a failed check (logged at once, listed in the summary). */
function fail(what: string, props: Record<string, unknown> = {}): void {
  result.failures.push(what);
  log.error('bot', 'Check failed', { what, table: TABLE, ...props });
  say(`FAIL ${what} ${JSON.stringify(props).slice(0, 200)}`);
}

/** The launched TV page, if any. */
let tvPage = null as import('@playwright/test').Page | null;
let browser = null as import('@playwright/test').Browser | null;

/** Opens a headless TV page on the table. */
async function launchTv(): Promise<void> {
  const { chromium } = await import('@playwright/test');
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  tvPage = await ctx.newPage();
  const app = (args.app ?? `${SERVER}/app/`).replace(/\/?$/, '/');
  await tvPage.goto(`${app}?mode=tv&table=${TABLE}&debug=1&name=bot%20TV&server=${encodeURIComponent(SERVER)}`);
  log.info('bot', 'TV page launched', { app, table: TABLE });
}

/**
 * Waits until the room has a TV and the bot holds a snapshot. 60 s: a headless TV page under
 * SwiftShader on a loaded Mac (load 45–80) once took over 20 s to answer its first snapshot, and
 * the soak stopped with exit 2 before it began (W5-P, 2026-10-26).
 */
async function waitForTv(bot: ProtoClient, timeoutMs = 60_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (bot.tvOnline) {
      try { await bot.snapshot(3000); return; } catch { /* TV still starting */ }
    }
    await Bun.sleep(250);
  }
  throw new Error(`no TV on table ${TABLE} within ${timeoutMs} ms`);
}

/** Lets in-flight broadcasts arrive, then compares the bot's copy (and the TV page's) with a snapshot. */
async function checkConvergence(bot: ProtoClient, when: string): Promise<void> {
  await Bun.sleep(150);
  result.convergenceChecks++;
  const snap = await bot.snapshot();
  await Bun.sleep(50);
  if (bot.rev !== snap.rev || !same(bot.confirmed, snap.state)) {
    result.convergenceFailures++;
    fail(`state diverged (${when})`, { botRev: bot.rev, tvRev: snap.rev, diff: firstDiff(bot.confirmed, snap.state) });
    bot.confirmed = snap.state; // carry on from the TV's truth
    bot.rev = snap.rev;
  }
  if (tvPage) {
    const page = await tvPage.evaluate(() => (window as unknown as { __battlemap?: { state: () => unknown } }).__battlemap?.state() ?? null).catch(() => null);
    if (page && !same(page, snap.state)) fail(`TV page state ≠ its snapshot (${when})`, { diff: firstDiff(page, snap.state) });
  }
}

/** Drops the socket, tries a command while offline, reconnects, and checks the offline rule. */
async function reconnect(bot: ProtoClient): Promise<void> {
  result.reconnects++;
  bot.drop();
  await Bun.sleep(200 + int(1500));
  const marker = `offline-${newId(6)}`;
  result.offlineTries++;
  const r = await bot.cmd({ type: 'game.rename', name: marker });
  if (r.ok || r.reason !== 'not connected') fail('a command was sent while disconnected', { result: r });
  await bot.connect();
  await waitForTv(bot);
  await Bun.sleep(1000); // a late replay would land now
  if (bot.confirmed?.game?.name === marker || bot.recent.some((m) => m.type === 'sync.applied' && (m.cmd as { name?: string }).name === marker)) {
    result.offlineLeaks++;
    fail('an offline command reached the TV after the reconnect', { marker });
  }
  log.info('bot', 'Reconnected', { n: result.reconnects, rev: bot.rev });
}

/** The whole soak run. */
async function main(): Promise<number> {
  say(`bot: table ${TABLE}, seed ${SEED}, ${TOTAL} commands, server ${SERVER}`);
  try {
    const h = await fetch(`${SERVER}/health`);
    if (!h.ok) throw new Error(`HTTP ${h.status}`);
  } catch (e) {
    log.error('bot', 'Server unreachable', { server: SERVER, error: String(e) });
    say(`bot: server ${SERVER} unreachable (${String(e)})`);
    return 2;
  }
  if (TV_MODE === 'launch') await launchTv();
  const bot = new ProtoClient({ wsUrl: `${SERVER.replace(/^http/, 'ws')}/ws`, room: TABLE, name: 'soak bot', log: (line, f) => log.info('bot', line, f) });
  await bot.connect();
  await waitForTv(bot);

  // A game on the start map.
  fixture(args.map!); // fails early on an unknown key
  const first = await uploadMap(SERVER, args.map!);
  maps.set(first.info.id, first);
  const gameId = newId();
  const opened = bot.next((m) => m.type === 'sync.snapshot' && (m.state as RootState).game?.id === gameId, 15_000, 'the game');
  bot.send({ type: 'game.new', game: { id: gameId, name: `Soak ${SEED}`, createdAt: new Date().toISOString(), map: first.info } });
  await opened;
  log.info('bot', 'Soak started', { table: TABLE, seed: SEED, map: args.map, commands: TOTAL });

  const t0 = Date.now();
  let lastRev = 0;
  let lastEpoch = bot.epoch;
  for (let i = 1; i <= TOTAL; i++) {
    if (!bot.confirmed?.game) {
      fail('the game disappeared', { i });
      break;
    }
    if (bot.epoch !== lastEpoch) { lastRev = 0; lastEpoch = bot.epoch; }
    const burst = rnd() < 0.05;
    const cmds: Command[] = [];
    for (let k = 0; k < (burst ? 10 : 1); k++) cmds.push(await randomCommand(bot.confirmed));
    const predicted = burst ? null : apply(bot.confirmed, cmds[0]!);
    const started = performance.now();
    const results = await Promise.all(cmds.map((c) => bot.cmd(c, 10_000)));
    const ms = performance.now() - started;
    result.rttMs.push(ms / cmds.length);
    for (const [k, r] of results.entries()) {
      result.sent++;
      if (r.ok) {
        result.applied++;
        if (r.rev <= lastRev) { result.orderViolations++; fail('revision went backwards', { rev: r.rev, lastRev }); }
        lastRev = r.rev;
      } else {
        result.refused++;
        result.refusedReasons[r.reason] = (result.refusedReasons[r.reason] ?? 0) + 1;
        if (['timeout', 'connection lost', 'not connected'].includes(r.reason)) fail(`command lost: ${r.reason}`, { type: cmds[k]!.type, i });
        if (predicted?.ok) { result.predictionMismatches++; fail('the TV refused what the reducer accepts here', { type: cmds[k]!.type, reason: r.reason }); }
      }
    }
    if (i % 10 === 0 || i === TOTAL) say(`[${i}/${TOTAL}] rev ${bot.rev}, refused ${result.refused}, failures ${result.failures.length}`);
    if (CHECK_EVERY > 0 && i % CHECK_EVERY === 0) await checkConvergence(bot, `after ${i}`);
    if (RECONNECT_EVERY > 0 && i % RECONNECT_EVERY === 0 && i < TOTAL) await reconnect(bot);
    if (tvPage && TV_RELOAD_EVERY > 0 && i % TV_RELOAD_EVERY === 0 && i < TOTAL) {
      result.tvReloads++;
      await Bun.sleep(2500); // let the autosave run
      await tvPage.reload();
      await waitForTv(bot);
      if (bot.confirmed?.game?.id !== gameId) fail('the TV did not reopen the game after a reload', { got: bot.confirmed?.game?.id ?? null });
      log.info('bot', 'TV reloaded', { n: result.tvReloads });
    }
  }
  await checkConvergence(bot, 'at the end');
  await bot.cmd({ type: 'table.reset' });

  const rtt = [...result.rttMs].sort((a, b) => a - b);
  const q = (p: number) => Math.round((rtt[Math.min(rtt.length - 1, Math.floor(p * rtt.length))] ?? 0) * 10) / 10;
  const summary = {
    ...result, rttMs: undefined, rttP50Ms: q(0.5), rttP95Ms: q(0.95), seconds: Math.round((Date.now() - t0) / 1000),
    perSecond: Math.round((result.sent / Math.max(1, (Date.now() - t0) / 1000)) * 10) / 10, botStats: bot.stats,
  };
  log.info('bot', result.failures.length ? 'Soak failed' : 'Soak passed', summary);
  say(JSON.stringify(summary, null, 1));
  bot.close();
  return result.failures.length ? 1 : 0;
}

let code = 2;
try {
  code = await main();
} catch (e) {
  log.error('bot', 'Bot crashed', { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack?.slice(0, 1500) : undefined });
  say(`bot: ${e instanceof Error ? e.message : String(e)}`);
  code = 2;
} finally {
  await browser?.close();
  await log.stop(code === 0 ? 'passed' : 'failed');
}
process.exit(code);
