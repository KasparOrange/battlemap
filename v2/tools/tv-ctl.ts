/**
 * tv-ctl — small dev and test control commands for a running TV (parity QA-03, the old
 * `tools/tv_ctl` commands). Joins the table as a companion over the real protocol, asks, prints
 * the answer as JSON, leaves. No extra protocol: the same peer messages the tablet sends
 * (`docs/protocol.md` "dev and test control").
 *
 *   bun tools/tv-ctl.ts status  --server https://… --table table-yf6kig4q   # diag.report
 *   bun tools/tv-ctl.ts prepare …   # save now (before a deploy) → deploy.ready
 *   bun tools/tv-ctl.ts resume  …   # reopen the newest game (after a deploy or a box reset)
 *   bun tools/tv-ctl.ts reload  …   # the TV saves and reloads the app (a new build)
 *   bun tools/tv-ctl.ts list    …   # the TV's games (device + server backups)
 *
 * Options: `--server` (default http://localhost:5929), `--table` (required), `--timeout` seconds
 * (default 20). Exit code 0 on an answer, 1 on an error or no TV within the timeout.
 */
import { parseArgs } from 'node:util';
import { ProtoClient } from '../e2e/support/proto.ts';

const { values: args, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    server: { type: 'string', default: 'http://localhost:5929' },
    table: { type: 'string' },
    timeout: { type: 'string', default: '20' },
  },
});

const COMMANDS = ['status', 'prepare', 'resume', 'reload', 'list'] as const;
type Cmd = (typeof COMMANDS)[number];

/** Prints a line of JSON (the tool's only output on stdout). */
function out(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Waits until the room has a TV. */
async function waitForTv(c: ProtoClient, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (!c.tvOnline) {
    if (Date.now() > end) throw new Error(`no TV on table ${args.table} within ${ms / 1000} s`);
    await Bun.sleep(200);
  }
}

/** Runs one command against the table's TV. */
async function main(cmd: Cmd, client: ProtoClient, timeoutMs: number): Promise<void> {
  await client.connect();
  await waitForTv(client, timeoutMs);
  switch (cmd) {
    case 'status':
      out(await client.request({ type: 'diag.status' }, ['diag.report'], timeoutMs));
      return;
    case 'prepare':
      out(await client.request({ type: 'deploy.prepare' }, ['deploy.ready'], timeoutMs));
      return;
    case 'list':
      out(await client.request({ type: 'lib.list' }, ['lib.listing'], timeoutMs));
      return;
    case 'reload':
      client.send({ type: 'tv.reload' });
      out({ sent: 'tv.reload' });
      return;
    case 'resume': {
      const listing = await client.request({ type: 'lib.list' }, ['lib.listing'], timeoutMs);
      const games = (listing.games ?? []) as { id: string; name: string; savedAt: string }[];
      const newest = games[0];
      if (!newest) throw new Error('the TV has no game to resume');
      client.send({ type: 'game.open', gameId: newest.id });
      const snap = await client.until((s) => s.game?.id === newest.id, timeoutMs);
      out({ resumed: newest.id, name: newest.name, activeMapId: snap.game?.activeMapId ?? null });
      return;
    }
  }
}

const cmd = positionals[0] as Cmd | undefined;
if (!cmd || !COMMANDS.includes(cmd) || !args.table) {
  process.stderr.write(`usage: bun tools/tv-ctl.ts <${COMMANDS.join('|')}> --table <room> [--server <url>] [--timeout <s>]\n`);
  process.exit(2);
}
const timeoutMs = Number(args.timeout) * 1000;
const client = new ProtoClient({ wsUrl: `${args.server!.replace(/\/$/, '').replace(/^http/, 'ws')}/ws`, room: args.table, name: 'tv-ctl' });
let code = 0;
try {
  await main(cmd, client, timeoutMs);
} catch (e) {
  process.stderr.write(`tv-ctl ${cmd}: ${e instanceof Error ? e.message : String(e)}\n`);
  code = 1;
} finally {
  client.close();
}
process.exit(code);
