#!/usr/bin/env bun
/**
 * Drive the shell's WebView from the Mac over the Chrome DevTools protocol (debug APKs only:
 * they enable WebView remote debugging). Used to check the shell on the Android bench.
 *
 *   bun v2/shell/tools/webview.ts <serial> eval '<js expression>'   evaluate (awaits promises), print JSON
 *   bun v2/shell/tools/webview.ts <serial> crash                   kill the renderer (tests recovery)
 *
 * <serial> is an `adb devices` serial, e.g. emulator-5556. ADB defaults to the SDK's adb.
 * Example: bun v2/shell/tools/webview.ts emulator-5556 eval 'window.shellPage.keys'
 */
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

const PACKAGE = 'app.battlemap.table';
const ADB = process.env.ADB ?? `${homedir()}/Library/Android/sdk/platform-tools/adb`;

/** Runs adb against [serial] and returns trimmed stdout; throws on failure. */
function adb(serial: string, ...args: string[]): string {
  const r = spawnSync(ADB, ['-s', serial, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`adb ${args.join(' ')}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

/** A free local TCP port (bind to 0, read it back, release it). */
function freePort(): number {
  const server = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
  const port = server.port;
  server.stop(true);
  return port;
}

/** Sends one CDP command on [ws] and resolves with its result (rejects on a CDP error). */
function command(ws: WebSocket, method: string, params: object): Promise<any> {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const msg = JSON.parse(String(e.data));
      if (msg.id !== id) return;
      ws.removeEventListener('message', onMessage);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const [serial, action, expression] = process.argv.slice(2);
  if (!serial || !['eval', 'crash'].includes(action ?? '') || (action === 'eval' && !expression)) {
    console.error("usage: webview.ts <serial> eval '<js>' | crash");
    process.exit(2);
  }
  const pid = adb(serial, 'shell', 'pidof', PACKAGE);
  if (!pid) throw new Error(`${PACKAGE} is not running on ${serial}`);
  const port = freePort();
  adb(serial, 'forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`);
  try {
    const pages: any[] = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = pages.find((p) => p.type === 'page');
    if (!page) throw new Error('no page in the WebView');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    if (action === 'crash') {
      ws.send(JSON.stringify({ id: 1, method: 'Page.crash', params: {} }));
      await Bun.sleep(1000);
      console.log(`renderer crash sent to ${page.url}`);
    } else {
      const r = await command(ws, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      console.log(JSON.stringify(r.result.value, null, 2));
    }
    ws.close();
  } finally {
    adb(serial, 'forward', '--remove', `tcp:${port}`);
  }
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
