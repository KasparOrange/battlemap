/**
 * How this page runs — read once at start: which mode, which server, which table, who we are.
 * Sources, first wins: the URL (`?mode=&server=&device=&table=&name=&upstream=`), the Android
 * shell's bridge, what this device remembered, defaults.
 *
 * **LAN play** (the second half of this file): a TV box hosts the table itself (the Rust server
 * inside the shell, port 5930). The TV page then talks to `http://127.0.0.1:5930`; companions
 * find the table by mDNS (inside the Android shell: {@link discoverLanTables}) or by the short
 * code / QR the TV shows ({@link decodeLanCode}, {@link lanJoinInfo}), and {@link joinTable}
 * remembers per table which server it lives on. At start a companion whose remembered LAN
 * server doesn't answer falls back to the internet server ({@link checkServerChoice}). The
 * protocol is the same on both servers, so nothing else in the app cares which one it talks to.
 *
 * @see ../../../docs/architecture.md "platforms"
 */
import { newId } from '@battlemap/shared';
import { onShellEvent, shellBridge, shellInfo, type LanStatus, type LanTable } from './shell.ts';

/**
 * TV mode (the table), companion mode (the DM's device), or the players' view (S12: read-only,
 * only from the URL `?mode=players&table=…` — never remembered, never the shell's start mode).
 */
export type Mode = 'tv' | 'companion' | 'players';

/** Everything the page needs to know about where it runs. */
export interface AppConfig {
  /** The mode, or null when the start picker should ask. */
  mode: Mode | null;
  /** The server's base URL, no trailing slash (`https://…`, `http://localhost:5929`). */
  serverUrl: string;
  /**
   * The internet server (the VPS) this device would use without LAN play — the fallback when a
   * LAN table server doesn't answer; for a TV hosting the table, the server its table server
   * syncs with. Null when there is none (a page served by a table server, a plain dev setup).
   */
  homeServerUrl: string | null;
  /** The page talks to a LAN table server (this TV's own, or a box a companion joined). */
  lan: boolean;
  /** The server's WebSocket endpoint. */
  wsUrl: string;
  /** A stable id of this device (the shell's, else one this browser keeps). */
  deviceId: string;
  /** A human name for this device. */
  deviceName: string;
  /** The table (relay room): the TV's own id, the companion's chosen one (null = pick). */
  tableId: string | null;
  /** This page's client id: new per page load, so commands are numbered per page. */
  clientId: string;
  /** The app build. */
  build: string;
}

const KEY_MODE = 'bm.mode';
const KEY_DEVICE = 'bm.device';
const KEY_TV_TABLE = 'bm.tv.table';
const KEY_LAST_TABLE = 'bm.companion.table';
const KEY_TABLE_SERVERS = 'bm.companion.servers';

/** localStorage that may be missing or throw (private mode, file://). */
function stored(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Writes localStorage, ignoring failure. */
function store(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    /* nothing to keep then */
  }
}

/** `tv`/`companion` from text, else null. */
function asMode(text: string | null | undefined): Mode | null {
  return text === 'tv' || text === 'companion' ? text : null;
}

/** A base URL without its trailing slash. */
function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * The page's WebSocket URL for a server base URL.
 *
 * @param serverUrl - `http(s)://host[:port]`
 * @returns `ws(s)://host[:port]/ws`
 */
export function wsUrlFor(serverUrl: string): string {
  return trimSlash(serverUrl).replace(/^http/, 'ws') + '/ws';
}

/** A guess at a name for this device from its user agent. */
function guessName(): string {
  const ua = globalThis.navigator?.userAgent ?? '';
  const info = shellInfo();
  // The owner's name for the device (Android's "Device name", qa#19); older shells lack it.
  if (info) return info.device.name || `${info.device.manufacturer} ${info.device.model}`.trim();
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android device';
  if (/Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'Browser';
}

/**
 * Reads the configuration for this page load.
 *
 * @param url - the page's URL (default: the current location)
 * @returns the configuration
 */
export function readConfig(url: URL = new URL(globalThis.location?.href ?? 'http://localhost/')): AppConfig {
  const q = url.searchParams;
  const info = shellInfo();

  const fromUrl = q.get('mode');
  const mode: Mode | null = fromUrl === 'players' ? 'players' : asMode(fromUrl) ?? asMode(info?.startMode) ?? asMode(stored(KEY_MODE));

  const envServer = (import.meta.env?.VITE_SERVER_URL as string | undefined) ?? null;
  const ownOrigin = url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  // The shell appends its configured server as `server=`; only a different one is a real choice.
  const asked = q.get('server');
  const explicit = asked && asked !== info?.serverUrl ? asked : null;
  const home = q.get('upstream') ?? info?.serverUrl ?? envServer ?? null;
  const tableAsked = q.get('table') ?? (mode === 'companion' ? stored(KEY_LAST_TABLE) : null);
  const remembered = mode === 'companion' && tableAsked && q.get('lan') !== 'off' ? tableServers()[tableAsked] ?? null : null;
  const serverUrl = trimSlash(explicit ?? remembered ?? home ?? ownOrigin ?? 'http://localhost:5929');
  const homeServerUrl = home ? trimSlash(home) : ownOrigin && !isLanUrl(ownOrigin) ? ownOrigin : null;

  let deviceId = q.get('device') ?? info?.deviceId ?? stored(KEY_DEVICE);
  if (!deviceId) {
    deviceId = newId(10);
    store(KEY_DEVICE, deviceId);
  }

  let tableId = q.get('table');
  if (mode === 'tv' && !tableId) {
    tableId = stored(KEY_TV_TABLE) ?? `table-${deviceId.slice(0, 8)}`;
    store(KEY_TV_TABLE, tableId);
  }
  if (mode === 'companion' && !tableId) tableId = stored(KEY_LAST_TABLE);

  const config: AppConfig = {
    mode,
    serverUrl,
    homeServerUrl,
    lan: isLanUrl(serverUrl),
    deviceId,
    deviceName: q.get('name') ?? guessName(),
    tableId,
    wsUrl: wsUrlFor(serverUrl),
    clientId: `${mode === 'tv' ? 'tv' : mode === 'players' ? 'p' : 'c'}-${newId(10)}`,
    build: typeof __BUILD__ === 'string' ? __BUILD__ : 'dev',
  };
  // The shell announces the hosted table on the LAN under this id and name.
  if (mode === 'tv' && tableId) shellBridge()?.announceTable?.(tableId, config.deviceName);
  return config;
}

/**
 * Remembers the mode picked on the start screen.
 *
 * @param mode - the mode, or null to ask again next time
 */
export function rememberMode(mode: Mode | null): void {
  store(KEY_MODE, mode);
}

/**
 * Remembers the table a companion joined, for the next start.
 *
 * @param tableId - the table, or null to forget it
 */
export function rememberTable(tableId: string | null): void {
  store(KEY_LAST_TABLE, tableId);
}

let current: AppConfig | null = null;

/**
 * The configuration of this page load, read on first use and then fixed (picking another mode
 * reloads the page with `?mode=`).
 *
 * @returns the configuration
 */
export function appConfig(): AppConfig {
  current ??= readConfig();
  return current;
}

// ---- LAN play ----------------------------------------------------------------------------------

/** The table server's port on a TV box (`shell/…/TableServer.kt`). */
export const LAN_PORT = 5930;

/** Crockford base32 — no I, L, O, U; read back case-insensitively with I/L → 1, O → 0. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Whether a server URL is on the local network (private IPv4, link-local, `localhost`,
 * `*.local`) — a LAN table server rather than the internet one.
 *
 * @param url - a base URL
 * @returns true for a LAN address
 */
export function isLanUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'localhost' || host.endsWith('.local')) return true;
  const p = host.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p as [number, number, number, number];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

/**
 * The short code the TV shows for its table server (same rule as the shell's `Lan.code`): the
 * IPv4 address in Crockford base32 — 4 characters for `192.168.x.y`, 7 for any other address —
 * and `-<port>` when the port isn't 5930.
 *
 * @param ip - dotted IPv4
 * @param port - the port (default 5930)
 * @returns the code, or null for something that isn't IPv4
 */
export function encodeLanCode(ip: string, port = LAN_PORT): string | null {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  const home = p[0] === 192 && p[1] === 168;
  let value = home ? p[2]! * 256 + p[3]! : ((p[0]! * 256 + p[1]!) * 256 + p[2]!) * 256 + p[3]!;
  let text = '';
  for (let i = 0; i < (home ? 4 : 7); i++) {
    text = ALPHABET[value % 32] + text;
    value = Math.floor(value / 32);
  }
  return port === LAN_PORT ? text : `${text}-${port}`;
}

/**
 * Reads what someone typed to join a LAN table: the TV's short code (`009A`, `0A00007-15930`),
 * an address (`192.168.1.42`, `192.168.1.42:5930`), a host name or a full URL.
 *
 * @param text - what was typed or scanned
 * @returns the table server's base URL (`http://192.168.1.42:5930`), or null when unreadable
 */
export function decodeLanCode(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) {
    try {
      return new URL(t).origin;
    } catch {
      return null;
    }
  }
  const hostPort = /^([a-z0-9.-]*[.][a-z0-9-]+|localhost)(?::(\d{1,5}))?$/i.exec(t);
  if (hostPort && (/[.]/.test(hostPort[1]!) || hostPort[1] === 'localhost') && !/^[0-9A-Z]{4}$|^[0-9A-Z]{7}$/i.test(t)) {
    return `http://${hostPort[1]!.toLowerCase()}:${hostPort[2] ?? LAN_PORT}`;
  }
  const m = /^([0-9a-z]{4}|[0-9a-z]{7}|[0-9a-z]{3}[- ][0-9a-z]{4})(?:[-: ](\d{1,5}))?$/i.exec(t);
  if (!m) return null;
  const code = m[1]!.replace(/[- ]/g, '').toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0');
  let value = 0;
  for (const ch of code) {
    const d = ALPHABET.indexOf(ch);
    if (d < 0) return null;
    value = value * 32 + d;
  }
  const port = m[2] ? Number(m[2]) : LAN_PORT;
  if (port < 1 || port > 65535) return null;
  let ip: string;
  if (code.length === 4) {
    if (value > 0xffff) return null;
    ip = `192.168.${Math.floor(value / 256)}.${value % 256}`;
  } else {
    if (value > 0xffffffff) return null;
    ip = [24, 16, 8, 0].map((s) => Math.floor(value / 2 ** s) % 256).join('.');
  }
  return `http://${ip}:${port}`;
}

/** The per-table server choices a companion remembered: table id → server base URL. */
function tableServers(): Record<string, string> {
  try {
    const v = JSON.parse(stored(KEY_TABLE_SERVERS) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Remembers which server a table lives on (a LAN table server), or forgets it (null = the
 * internet server again). Read by {@link readConfig} at the next start.
 *
 * @param tableId - the table (relay room)
 * @param serverUrl - its server, or null
 */
export function rememberTableServer(tableId: string, serverUrl: string | null): void {
  const all = tableServers();
  if (serverUrl) all[tableId] = trimSlash(serverUrl);
  else delete all[tableId];
  store(KEY_TABLE_SERVERS, JSON.stringify(all));
}

/**
 * Whether a server answers `/health` in time.
 *
 * @param serverUrl - its base URL
 * @param timeoutMs - how long to wait (default 2.5 s)
 * @returns true when it answered ok
 */
export async function probeServer(serverUrl: string, timeoutMs = 2_500): Promise<boolean> {
  try {
    const res = await fetch(`${trimSlash(serverUrl)}/health`, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * The page address that joins `tableId` on `serverUrl` as a companion. Inside the Android shell
 * (it may talk to `http://` servers from its https origin) this page with new parameters; in a
 * browser, for a LAN server, the table server's own copy of the app (`http://<box>:5930/app/`)
 * — an https page can't open `ws://` connections, and the box serves the app offline anyway.
 *
 * @param serverUrl - the table's server
 * @param tableId - the table (null = pick on the server)
 * @param here - the current page (default the location)
 * @returns the URL to load
 */
export function joinUrlFor(serverUrl: string, tableId: string | null, here: URL = new URL(globalThis.location?.href ?? 'http://localhost/')): string {
  const server = trimSlash(serverUrl);
  const sameOrigin = (() => {
    try {
      return new URL(server).origin === here.origin;
    } catch {
      return false;
    }
  })();
  const target = shellBridge() || sameOrigin || !isLanUrl(server) ? new URL(here.pathname, here.origin) : new URL(`${server}/app/`);
  target.searchParams.set('mode', 'companion');
  if (tableId) target.searchParams.set('table', tableId);
  target.searchParams.set('server', server);
  if (shellBridge() && here.searchParams.get('device')) target.searchParams.set('device', here.searchParams.get('device')!);
  return target.toString();
}

/**
 * Joins a table on a server: remembers the choice (a LAN server per table, the last table) and
 * loads the companion for it.
 *
 * @param serverUrl - the table's server (a LAN table server or the internet one)
 * @param tableId - the table, or null to pick one on that server
 */
export function joinTable(serverUrl: string, tableId: string | null): void {
  if (tableId) {
    rememberTableServer(tableId, isLanUrl(serverUrl) ? serverUrl : null);
    rememberTable(tableId);
  }
  globalThis.location?.assign(joinUrlFor(serverUrl, tableId));
}

/**
 * Companion start check: when the remembered LAN server of this table doesn't answer but the
 * internet server does, reload onto the internet server (`?lan=off` for this load only — the
 * LAN choice stays remembered for the next game night). Call once after boot.
 *
 * @param config - this page's configuration
 * @returns `'ok'` (stay), `'fallback'` (reloading onto the internet server) or `'unreachable'`
 *   (neither answers — the connection screen says so)
 */
export async function checkServerChoice(config: AppConfig = appConfig()): Promise<'ok' | 'fallback' | 'unreachable'> {
  if (config.mode !== 'companion' || !config.lan) return 'ok';
  if (await probeServer(config.serverUrl)) return 'ok';
  const home = config.homeServerUrl;
  if (!home || home === config.serverUrl || !(await probeServer(home))) return 'unreachable';
  const here = new URL(globalThis.location?.href ?? 'http://localhost/');
  here.searchParams.set('server', home);
  here.searchParams.set('lan', 'off');
  globalThis.location?.replace(here.toString());
  return 'fallback';
}

/** Whether this device can look for LAN tables by itself (mDNS needs the Android shell). */
export function canDiscoverLan(): boolean {
  return typeof shellBridge()?.discoverTables === 'function';
}

/**
 * Looks for tables on the LAN (Android shell only; mDNS `_battlemap._tcp`) until stopped.
 * Outside the shell `onChange` gets one empty list — offer the code field instead.
 *
 * @param onChange - gets the whole list on every change
 * @returns a function that stops looking
 */
export function discoverLanTables(onChange: (tables: LanTable[]) => void): () => void {
  const bridge = shellBridge();
  if (!bridge || typeof bridge.discoverTables !== 'function') {
    onChange([]);
    return () => {};
  }
  const off = onShellEvent((d) => {
    if (d.type === 'tables') onChange(d.tables);
  });
  try {
    onChange(JSON.parse(bridge.lanTables()) as LanTable[]);
  } catch {
    onChange([]);
  }
  bridge.discoverTables(true);
  return () => {
    off();
    bridge.discoverTables(false);
  };
}

/** What the TV home shows so companions can join its LAN table. */
export interface LanJoinInfo {
  /** The table server runs on this TV. */
  hosting: boolean;
  /** The short code to type (`009A`), null without a LAN address. */
  code: string | null;
  /** `http://192.168.1.42:5930` */
  url: string | null;
  /** The address the QR code holds (the box's own app as this table's companion). */
  joinUrl: string | null;
  /** A QR code of `joinUrl` as SVG, drawn by the table server (works offline). */
  qrSvgUrl: string | null;
  /** Why hosting doesn't run, when it doesn't. */
  error: string | null;
}

/**
 * The TV's LAN join details (TV mode inside the shell), or null when this TV doesn't host.
 *
 * @param status - the shell's status (default: asked now)
 * @returns the details, or null
 */
export function lanJoinInfo(status: LanStatus | null = lanStatus()): LanJoinInfo | null {
  if (!status || !status.hosting) return null;
  const local = status.server.localUrl;
  return {
    hosting: status.server.running,
    code: status.code,
    url: status.url,
    joinUrl: status.joinUrl,
    qrSvgUrl: local && status.joinUrl ? `${local}/api/qr.svg?text=${encodeURIComponent(status.joinUrl)}` : null,
    error: status.server.error,
  };
}

/** The shell's LAN status now, or null outside the shell (or an older shell). */
export function lanStatus(): LanStatus | null {
  const bridge = shellBridge();
  if (!bridge || typeof bridge.lan !== 'function') return null;
  try {
    return JSON.parse(bridge.lan()) as LanStatus;
  } catch {
    return null;
  }
}

/**
 * Calls `handler` whenever hosting changes (started, failed, the address or announcement
 * changed) with the new join details.
 *
 * @param handler - gets the details (null when this TV stopped hosting)
 * @returns a function that stops listening
 */
export function onLanChange(handler: (info: LanJoinInfo | null) => void): () => void {
  return onShellEvent((d) => {
    if (d.type === 'lan') handler(lanJoinInfo(d));
  });
}
