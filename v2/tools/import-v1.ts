#!/usr/bin/env bun
/**
 * import-v1 — brings the old app's games and maps over to v2 (roadmap N2). Joins v1's relay as a
 * `bot` (it sits next to the tablet, the TV keeps running), asks the v1 TV for its library (every
 * game's full session JSON), fetches each map's file (the old dev server's shared library, the
 * map's upload link, or — when neither has it — from the TV itself, the way it sends a map to the
 * tablet on a resume), converts everything to v2 and stores each game on the v2 server as a
 * backup. A v2 TV then lists the games ("on the server") and opens them like its own.
 *
 *   bun v2/tools/import-v1.ts --server https://battlemap.srv1189697.hstgr.cloud [options]
 *
 *   --server <url>       the v2 server (default http://localhost:5929)
 *   --v1-relay <url>     v1's relay (default ws://72.62.88.197:9090)
 *   --v1-http <url>      v1's dev server (default http://72.62.88.197:4242)
 *   --listing <file>     read the listing from a file (saved earlier) instead of the TV; maps then
 *                        come only from the dev server
 *   --save-listing <f>   write the TV's listing (v1's raw JSON) to a file — a backup of every game
 *   --no-tv-transfer     never ask the TV for a map file (it opens a game for that; a game it had
 *                        to start is deleted again, the TV goes back to its library at the end)
 *   --no-library         don't add the TV's maps to v2's shared library
 *   --calibrate <table>  also send the v1 TV's calibration (picture width, overscan) to the v2 TV
 *                        at this table (its id, `table-…`)
 *   --dry-run            convert and upload files, but store no game or library entry
 *   --json               print the report as JSON
 *
 * What converts: maps (`.dd2vtt` with walls/doors/lights, pictures with v1's squares, PDF pages
 * as the TV rendered them), fog, open doors, tokens (no HP/conditions), drawings, DM layers,
 * ruler, template disc, the table window / whole-map / free camera, rotation, grid lines, game
 * settings (fog look, trim, fade, effects, map lights, preview first, Draw/Measure tabs). What
 * doesn't is listed per game. Running it again overwrites the backups with v1's state (the
 * server keeps the ten previous versions). Exit code 0 = every game stored, 1 = something was
 * left out, 2 = could not start. Logs: MwLog app `battlemap-v2-import-v1`.
 *
 * @see ../docs/features.md "v1 import"
 */
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { init } from '../server/node_modules/mwlog/src/index.ts';
import { ProtoClient } from '../e2e/support/proto.ts';
import { V1Bot } from './import-v1/relay.ts';
import { importV1, type ImportV1Report } from './import-v1/run.ts';
import type { V1Listing } from './import-v1/v1.ts';
import { v2Server } from './import-v1/v2-server.ts';

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    server: { type: 'string', default: 'http://localhost:5929' },
    'v1-relay': { type: 'string', default: 'ws://72.62.88.197:9090' },
    'v1-http': { type: 'string', default: 'http://72.62.88.197:4242' },
    listing: { type: 'string' },
    'save-listing': { type: 'string' },
    'no-tv-transfer': { type: 'boolean', default: false },
    'no-library': { type: 'boolean', default: false },
    calibrate: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
});

const log = init({ app: 'battlemap-v2-import-v1', tenant: 'battlemap', version: '0.1.0', start: { server: args.server, v1Relay: args['v1-relay'], dryRun: args['dry-run'] } });

/** A line for the person running it (stderr, so `--json` keeps stdout clean). */
function say(line: string): void {
  process.stderr.write(`${line}\n`);
}

/** The v1 TV's calibration: from its status, else from the newest game's `mapFit`. */
function calibrationOf(status: Record<string, unknown> | null, listing: V1Listing): { widthInches: number | null; overscanPercent: number | null } {
  const fromStatus = typeof status?.tvWidthInches === 'number' ? status.tvWidthInches : null;
  const newest = [...listing.sessions].sort((a, b) => String(b.lastModifiedAt ?? '').localeCompare(String(a.lastModifiedAt ?? '')))[0];
  const fromGame = newest?.mapFit?.screenWidthInches ?? null;
  const overscan = typeof status?.tvOverscanPercent === 'number' ? status.tvOverscanPercent : null;
  return { widthInches: fromStatus ?? fromGame, overscanPercent: overscan };
}

/** Sends the calibration to a v2 TV (`table.calibrate`, `table.overscan`). */
async function calibrate(table: string, widthInches: number, overscanPercent: number | null): Promise<void> {
  const c = new ProtoClient({ wsUrl: `${args.server!.replace(/^http/, 'ws')}/ws`, room: table, name: 'v1 import' });
  await c.connect();
  const end = Date.now() + 20_000;
  while (!c.tvOnline) {
    if (Date.now() > end) throw new Error(`no v2 TV at table ${table}`);
    await Bun.sleep(200);
  }
  await c.must({ type: 'table.calibrate', widthInches });
  if (overscanPercent !== null) await c.must({ type: 'table.overscan', percent: overscanPercent });
  c.drop();
}

/** Prints the report for a person. */
function printReport(r: ImportV1Report): void {
  const ok = r.maps.filter((m) => m.id);
  say(`\nMaps: ${ok.length} of ${r.maps.length} converted${r.libraryAdded.length ? `, ${r.libraryAdded.length} added to the shared library` : ''}`);
  for (const m of r.maps.filter((x) => !x.id)) say(`  ✗ ${m.name} (${m.v1Id}): ${m.error}`);
  say(`Games: ${r.games.filter((g) => g.stored).length} of ${r.games.length} stored`);
  for (const g of r.games) {
    say(`  ${g.stored ? '✓' : '✗'} ${g.name} — ${g.maps} map(s)`);
    for (const i of g.issues) say(`      · ${i}`);
  }
  say(`DM layer pictures: ${r.layers.copied} copied${r.layers.missing.length ? `, ${r.layers.missing.length} missing` : ''}`);
}

/** The run. */
async function main(): Promise<number> {
  const server = v2Server(args.server!);
  let bot: V1Bot | null = null;
  let listing: V1Listing;
  let status: Record<string, unknown> | null = null;
  if (args.listing) {
    listing = JSON.parse(readFileSync(args.listing, 'utf8')) as V1Listing;
    say(`Listing from ${args.listing}: ${listing.maps.length} maps, ${listing.sessions.length} games`);
  } else {
    bot = new V1Bot(args['v1-relay']!);
    bot.onLog = (line, f) => log.info('import-v1', line, f);
    const online = await bot.connect();
    if (!online) {
      say('The v1 TV is not on the relay — switch the box on (battlemap in TV mode) and run again.');
      bot.close();
      return 2;
    }
    listing = await bot.listing();
    status = await bot.status();
    say(`v1 TV: ${listing.maps.length} maps, ${listing.sessions.length} games`);
  }
  if (args['save-listing']) {
    writeFileSync(args['save-listing'], JSON.stringify(listing, null, 2));
    say(`Listing saved to ${args['save-listing']}`);
  }
  const report = await importV1({
    listing, v1Http: args['v1-http']!, server,
    tv: bot && !args['no-tv-transfer'] ? bot : null,
    library: !args['no-library'], dryRun: args['dry-run']!,
    log, say,
  });
  const cal = calibrationOf(status, listing);
  if (cal.widthInches) say(`v1 calibration: picture ${cal.widthInches.toFixed(1)} in wide${cal.overscanPercent !== null ? `, overscan ${cal.overscanPercent} %` : ''}`);
  if (args.calibrate && cal.widthInches && !args['dry-run']) {
    await calibrate(args.calibrate, cal.widthInches, cal.overscanPercent);
    say(`Calibration sent to the v2 TV at ${args.calibrate}`);
  }
  bot?.close();
  if (args.json) process.stdout.write(`${JSON.stringify({ ...report, calibration: cal }, null, 2)}\n`);
  else printReport(report);
  const complete = report.maps.every((m) => m.id) && report.games.every((g) => g.stored || args['dry-run']);
  return complete ? 0 : 1;
}

main().then(
  async (code) => {
    await log.flush();
    process.exit(code);
  },
  async (e) => {
    say(`import-v1 failed: ${e instanceof Error ? e.message : String(e)}`);
    log.error('import-v1', 'v1 import failed', { error: String(e) });
    await log.flush();
    process.exit(2);
  },
);
