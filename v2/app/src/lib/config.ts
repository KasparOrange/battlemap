/**
 * How this page runs — read once at start: which mode, which server, which table, who we are.
 * Sources, first wins: the URL (`?mode=&server=&device=&table=&name=`), the Android shell's
 * bridge, what this device remembered, defaults.
 *
 * @see ../../../docs/architecture.md "platforms"
 */
import { newId } from '@battlemap/shared';
import { shellInfo } from './shell.ts';

/** TV mode (the table) or companion mode (the DM's device). */
export type Mode = 'tv' | 'companion';

/** Everything the page needs to know about where it runs. */
export interface AppConfig {
  /** The mode, or null when the start picker should ask. */
  mode: Mode | null;
  /** The server's base URL, no trailing slash (`https://…`, `http://localhost:5929`). */
  serverUrl: string;
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

  const mode = asMode(q.get('mode')) ?? asMode(info?.startMode) ?? asMode(stored(KEY_MODE));

  const envServer = (import.meta.env?.VITE_SERVER_URL as string | undefined) ?? null;
  const ownOrigin = url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  const serverUrl = trimSlash(q.get('server') ?? info?.serverUrl ?? envServer ?? ownOrigin ?? 'http://localhost:5929');

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

  return {
    mode,
    serverUrl,
    wsUrl: wsUrlFor(serverUrl),
    deviceId,
    deviceName: q.get('name') ?? guessName(),
    tableId,
    clientId: `${mode === 'tv' ? 'tv' : 'c'}-${newId(10)}`,
    build: typeof __BUILD__ === 'string' ? __BUILD__ : 'dev',
  };
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
