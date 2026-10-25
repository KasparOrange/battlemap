/**
 * Runs the server contract against one implementation:
 *
 * ```sh
 * bun run.ts --target bun  --port 6301          # the Bun server (../server, via bun-launch.ts)
 * bun run.ts --target rust --port 6302          # the Rust server (../server-rs/target/release/battlemap-server)
 * bun run.ts --target rust --bin <path> [--tight-port N] [--mock-port N] [files…] [--keep]
 * ```
 *
 * It makes a temp folder (a tiny built app, a fresh data folder seeded with cleanup fixtures, a
 * second data folder), starts two servers — **main** on `--port` with test-sized settings and
 * **tight** on `--tight-port` (default `--port + 100`) with tiny relay limits — and the suite (`tests/*.contract.ts`)
 * with `SERVER_URL`, `SERVER_TIGHT_URL`, `DATA_DIR`, `APP_DIR`, `MOCK_PORT` (`--mock-port`, default `--port + 200`).
 * Afterwards it checks the graceful stop (SIGTERM: exit 0 within 5 s, open sockets closed),
 * stops both servers by PID and removes the folder (`--keep` leaves it, with the servers' logs).
 *
 * @see ../docs/server-rs.md "contract"
 */
import { spawn, type Subprocess } from 'bun';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MAIN, TIGHT_LIMITS } from './lib-settings.ts';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1] ?? null;
  args.splice(i, 2);
  return v;
};
const target = flag('--target') ?? 'bun';
const port = Number(flag('--port') ?? (target === 'bun' ? 6301 : 6302));
const bin = resolve(flag('--bin') ?? join(import.meta.dir, '..', 'server-rs', 'target', 'release', 'battlemap-server'));
const tightPort = Number(flag('--tight-port') ?? port + 100);
const mockPort = Number(flag('--mock-port') ?? port + 200);
const keep = args.includes('--keep');
const only = args.filter((a) => a !== '--keep');
if (target !== 'bun' && target !== 'rust') throw new Error('--target bun | rust');

const root = mkdtempSync(join(tmpdir(), `claude-v2-contract-${target}-`));
const appDir = join(root, 'app');
const mainData = join(root, 'data-main');
const tightData = join(root, 'data-tight');

// The built app: what the static routes and the build watch need.
mkdirSync(join(appDir, 'assets'), { recursive: true });
writeFileSync(join(appDir, 'index.html'), '<!doctype html><title>app</title>');
writeFileSync(join(appDir, 'assets', 'a-123.js'), 'console.info(1)');
writeFileSync(join(appDir, 'build.json'), JSON.stringify({ build: 'test-build' }));

// Cleanup fixtures: what the start-up cleanup must remove and what it must keep.
const old = (Date.now() - 40 * 86_400_000) / 1000;
for (const sub of ['uploads', 'trash/game-old-1', 'trash/game-new-2', 'files']) mkdirSync(join(mainData, sub), { recursive: true });
const touch = (path: string, aged: boolean) => {
  writeFileSync(path, 'x');
  if (aged) utimesSync(path, old, old);
};
touch(join(mainData, 'uploads', 'aaaaaaaaaaaa.png'), true);
touch(join(mainData, 'uploads', 'bbbbbbbbbbbb.png'), false);
utimesSync(join(mainData, 'trash', 'game-old-1'), old, old);
touch(join(mainData, 'files', `${'a'.repeat(64)}.png`), true);
touch(join(mainData, 'files', 'x.png.1.1.tmp'), true);
touch(join(mainData, 'library.json.1.2.tmp'), true);
mkdirSync(tightData, { recursive: true });

const common = {
  ...process.env,
  MWLOG_DISABLE: '1',
  HOST: '127.0.0.1',
  APP_DIR: appDir,
  BATTLEMAP_SERVER_BUILD: 'contract',
  BATTLEMAP_FETCH_TEST_ADDR: '127.0.0.1',
  BATTLEMAP_LOG_STDERR: '1',
};
const mainEnv = {
  ...common,
  PORT: String(port),
  DATA_DIR: mainData,
  HELLO_TIMEOUT_MS: String(MAIN.helloTimeoutMs),
  MAX_UPLOAD_BYTES: String(MAIN.maxUploadBytes),
  MAX_GAME_BYTES: String(MAIN.maxGameBytes),
  FETCH_TIMEOUT_MS: String(MAIN.fetchTimeoutMs),
  CLEANUP_EVERY_MS: String(MAIN.cleanupEveryMs),
  BUILD_POLL_MS: String(MAIN.buildPollMs),
  // versions by count only, as the Bun server keeps them (the Rust default is one per 10 min, review #30)
  GAME_VERSION_SLOT_MS: '0',
};
const t = TIGHT_LIMITS;
const tightEnv = {
  ...common,
  PORT: String(tightPort),
  DATA_DIR: tightData,
  HELLO_TIMEOUT_MS: String(t.helloTimeoutMs),
  BUILD_POLL_MS: '0',
  CLEANUP_EVERY_MS: '0',
  RELAY_ZOMBIE_MS: String(t.zombieMs),
  RELAY_SWEEP_MS: String(t.sweepMs),
  RELAY_RATE_PER_S: String(t.ratePerS),
  RELAY_RATE_BURST: String(t.rateBurst),
  RELAY_RATE_CLOSE_AFTER: String(t.rateCloseAfter),
  RELAY_COMPANIONS_PER_ROOM: String(t.companionsPerRoom),
  RELAY_MAX_ROOMS: String(t.maxRooms),
  RELAY_WAITING_PER_IP: String(t.waitingPerIp),
  RELAY_MAX_FRAME_BYTES: String(t.maxFrameBytes),
};

/** Starts one server; its output goes to `<root>/<name>.log`. */
function start(name: string, env: Record<string, string | undefined>): Subprocess {
  const cmd = target === 'bun' ? ['bun', join(import.meta.dir, 'bun-launch.ts')] : [bin];
  const out = Bun.file(join(root, `${name}.log`));
  return spawn({ cmd, env, stdout: out, stderr: out, cwd: root });
}

/** Waits until a server answers `/health`. */
async function healthy(url: string, proc: Subprocess): Promise<void> {
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    if (proc.exitCode !== null) throw new Error(`${url}: the server exited (${proc.exitCode}) — see ${root}`);
    try {
      if ((await fetch(`${url}/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await Bun.sleep(100);
  }
  throw new Error(`${url}: no /health within 20 s`);
}

/** SIGTERM with a socket open: the process must close it and exit 0 within 5 s. */
async function gracefulStop(url: string, proc: Subprocess): Promise<string | null> {
  const ws = new WebSocket(url.replace(/^http/, 'ws') + '/ws');
  let closeCode: number | null = null;
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'hello', protocol: 1, role: 'tv', room: 'bye', client: 'tvBye', name: 'x', build: 'x' }));
    };
    ws.onmessage = () => resolve();
    ws.onerror = () => reject(new Error('socket failed'));
  });
  ws.onclose = (ev) => (closeCode = ev.code);
  const t0 = Date.now();
  proc.kill('SIGTERM');
  const exited = await Promise.race([proc.exited, Bun.sleep(5_000).then(() => null)]);
  const ms = Date.now() - t0;
  await Bun.sleep(50);
  if (exited === null) return `no exit within 5 s of SIGTERM`;
  if (exited !== 0) return `exit code ${exited} after SIGTERM`;
  if (closeCode === null) return 'the open socket was not closed';
  console.info(`graceful stop: exit 0 in ${ms} ms, the open socket closed with ${closeCode}`);
  return null;
}

const mainUrl = `http://127.0.0.1:${port}`;
const tightUrl = `http://127.0.0.1:${tightPort}`;
let status = 1;
let main: Subprocess | null = null;
let tight: Subprocess | null = null;
try {
  main = start('main', mainEnv);
  tight = start('tight', tightEnv);
  await healthy(mainUrl, main);
  await healthy(tightUrl, tight);
  const dir = join(import.meta.dir, 'tests');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.contract.ts'))
    .filter((f) => only.length === 0 || only.some((o) => f.includes(o)))
    .sort()
    .map((f) => `./tests/${f}`);
  const test = spawn({
    cmd: ['bun', 'test', '--timeout', '20000', ...files],
    cwd: import.meta.dir,
    env: { ...process.env, SERVER_URL: mainUrl, SERVER_TIGHT_URL: tightUrl, DATA_DIR: mainData, APP_DIR: appDir, MOCK_PORT: String(mockPort), CONTRACT_FIXES: target === 'rust' ? '1' : '0', SERVER_BIN: target === 'rust' ? bin : '', TABLE_PORT: String(port + 300) },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  status = await test.exited;
  const stopProblem = await gracefulStop(mainUrl, main);
  if (stopProblem) {
    console.error(`graceful stop FAILED: ${stopProblem}`);
    status = status || 1;
  }
} catch (e) {
  console.error(String(e));
} finally {
  const procs = [main, tight].filter((p): p is Subprocess => p !== null);
  for (const p of procs) if (p.exitCode === null) p.kill('SIGTERM');
  await Promise.race([Promise.all(procs.map((p) => p.exited)), Bun.sleep(5_000)]);
  for (const p of procs) if (p.exitCode === null) p.kill('SIGKILL');
  if (keep) console.info(`kept ${root}`);
  else rmSync(root, { recursive: true, force: true });
}
console.info(`contract against ${target}: ${status === 0 ? 'green' : 'FAILED'}`);
process.exit(status);
