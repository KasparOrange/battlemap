#!/usr/bin/env bun
/**
 * Runs the performance checks inside a device's WebView and prints the numbers as JSON:
 * the shell's WebGL probe (`--es page probe`, result from logcat `PROBE_RESULT`) and the app's
 * renderer bench (`/app/bench.html`, results from `window.__bench` over the DevTools protocol —
 * debug APKs only). The bench also logs one line per scene to MwLog (area `bench`).
 *
 *   bun v2/tools/bench-run.ts <serial> [--probe] [--bench] [--query 'scene=all&seconds=8']
 *                             [--probe-query 'load=2'] [--out file.json]
 *
 * Without --probe/--bench it runs both. The app must be installed (tools/deploy-devices.sh).
 * Real devices go over latrine's adb server: `ANDROID_ADB_SERVER_PORT=5059 bun … 192.168.178.149:5555`.
 * Exit codes: 0 ran, 1 a run failed, 2 usage, 3 device or app not reachable.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const PKG = 'app.battlemap.table';
const ADB = process.env.ADB ?? `${homedir()}/Library/Android/sdk/platform-tools/adb`;
const WEBVIEW = join(resolve(import.meta.dir, '..'), 'shell', 'tools', 'webview.ts');

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    probe: { type: 'boolean', default: false },
    bench: { type: 'boolean', default: false },
    query: { type: 'string', default: 'scene=all&seconds=8' },
    'probe-query': { type: 'string', default: '' },
    out: { type: 'string' },
  },
});
const serial = positionals[0];
if (!serial) {
  console.error('usage: bench-run.ts <serial> [--probe] [--bench] [--query …] [--out file]');
  process.exit(2);
}
const both = !args.probe && !args.bench;

/** Runs adb against the device; returns stdout (throws on failure). */
function adb(...a: string[]): string {
  const r = spawnSync(ADB, ['-s', serial!, ...a], { encoding: 'utf8', timeout: 60_000 });
  if (r.status !== 0) throw new Error(`adb ${a.join(' ')}: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}

/** Evaluates JS in the app's WebView (debug APK), parsed. */
function evalPage(expr: string): unknown {
  const r = spawnSync('bun', [WEBVIEW, serial!, 'eval', expr], { encoding: 'utf8', timeout: 60_000 });
  if (r.status !== 0) throw new Error(`webview eval: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
  return JSON.parse(r.stdout || 'null');
}

/** The probe: start the shell's probe page, wait for its logcat line. */
async function runProbe(): Promise<unknown> {
  adb('logcat', '-c');
  const page = args['probe-query'] ? `probe?${args['probe-query']}` : 'probe';
  adb('shell', 'am', 'start', '-S', '-n', `${PKG}/.MainActivity`, '--es', 'page', `'${page}'`);
  process.stdout.write('probe: running (about 25 s) [0/2]\n');
  for (let i = 0; i < 60; i++) {
    await Bun.sleep(2000);
    const line = adb('logcat', '-d', '-s', 'battlemap').split('\n').find((l) => l.includes('PROBE_RESULT'));
    // the WebView appends the console line's source (` (probe.html:123)`): cut after the JSON
    if (line) return JSON.parse(line.slice(line.indexOf('PROBE_RESULT') + 'PROBE_RESULT'.length, line.lastIndexOf('}') + 1).trim());
  }
  throw new Error('no PROBE_RESULT in logcat within 120 s');
}

/** The bench: start the app, navigate its page to bench.html, poll `window.__bench`. */
async function runBench(): Promise<unknown> {
  adb('shell', 'am', 'start', '-S', '-n', `${PKG}/.MainActivity`);
  await Bun.sleep(6000);
  evalPage(`(location.href = new URL('/app/bench.html?${args.query}', location.href).toString(), 'ok')`);
  process.stdout.write('bench: running [1/2]\n');
  for (let i = 0; i < 300; i++) {
    await Bun.sleep(3000);
    let b: { done?: boolean; results?: unknown[]; error?: string } | null = null;
    try { b = evalPage('window.__bench ?? null') as typeof b; } catch { continue; } // page still loading
    if (b?.done) {
      evalPage(`(location.href = new URL('/app/index.html', location.href).toString(), 'ok')`);
      return b;
    }
  }
  throw new Error('bench did not finish within 15 min');
}

try {
  adb('get-state');
  if (!adb('shell', 'pm', 'list', 'packages', PKG).includes(PKG)) throw new Error(`${PKG} is not installed — run tools/deploy-devices.sh first`);
} catch (e) {
  console.error(`bench-run: ${String((e as Error).message ?? e)}`);
  process.exit(3);
}

const out: Record<string, unknown> = { serial, at: new Date().toISOString(), device: adb('shell', 'getprop', 'ro.product.model') };
let code = 0;
if (both || args.probe) {
  try { out.probe = await runProbe(); } catch (e) { out.probeError = String(e); code = 1; }
}
if (both || args.bench) {
  try { out.bench = await runBench(); } catch (e) { out.benchError = String(e); code = 1; }
}
process.stdout.write('done [2/2]\n');
const json = JSON.stringify(out, null, 1);
if (args.out) writeFileSync(args.out, json);
console.log(json);
process.exit(code);
