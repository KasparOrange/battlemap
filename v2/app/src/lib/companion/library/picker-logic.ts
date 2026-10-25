/**
 * The table picker's rows: tables found on this Wi-Fi (the TV hosts the game itself — LAN play,
 * `config.ts` "LAN play") and tables the battlemap server sees online, merged into one model so
 * the screen only draws rows. Each row says where its table runs ("On the TV" / "Online") and
 * which server a tap joins. Plain TS, tested under `bun test`.
 */
import { encodeLanCode, isLanUrl } from '../../config.ts';
import type { LanTable } from '../../shell.ts';
import { tableCode } from '../frame/table-code.ts';
import type { TableRow } from './services.ts';

/** Where a table's game runs. */
export type TableWhere = 'tv' | 'online';

/** One row of the picker. */
export interface PickerRow {
  /** Stable key for the list. */
  key: string;
  /** The table (relay room), null when the TV's announcement has none yet (pick on its server). */
  room: string | null;
  /** The TV's name. */
  name: string;
  /** The server a tap joins. */
  serverUrl: string;
  /** Where the game runs: on the TV itself (a LAN table server) or on the internet server. */
  where: TableWhere;
  /** The short code the TV shows for it (LAN: its address code; online: the table code). */
  code: string;
  /** The line under the name. */
  sub: string;
  /** This device joined it last. */
  lastUsed: boolean;
}

/**
 * Where the games of a server run: a LAN address is a TV's own table server; `localhost` and
 * `127.x` count as online (a development server on this machine — a TV's server is never
 * reached as localhost from a tablet).
 *
 * @param serverUrl - the server's base URL
 * @returns `tv` or `online`
 */
export function serverWhere(serverUrl: string): TableWhere {
  let host = '';
  try {
    host = new URL(serverUrl).hostname;
  } catch {
    return 'online';
  }
  return isLanUrl(serverUrl) && host !== 'localhost' && !host.startsWith('127.') ? 'tv' : 'online';
}

/** "2 tablets connected" / "Waiting for a tablet". */
function companionsText(n: number): string {
  return n > 0 ? `${n} ${n === 1 ? 'tablet' : 'tablets'} connected` : 'Waiting for a tablet';
}

/**
 * The code a TV shows for its LAN table: its address code ("009A"), else the table code.
 *
 * @param t - the found table
 * @returns the code
 */
function lanCode(t: Pick<LanTable, 'host' | 'port' | 'table'>): string {
  return encodeLanCode(t.host, t.port) ?? (t.table ? tableCode(t.table) : '—');
}

/**
 * Rows for tables found on this Wi-Fi (mDNS through the Android shell, or read from a typed code).
 *
 * @param found - the tables
 * @param lastTable - the table this device joined last
 * @returns the rows, last used first, then by name
 */
export function nearbyRows(found: readonly LanTable[], lastTable: string | null): PickerRow[] {
  return sortRows(found.map((t) => ({
    key: `lan:${t.url}:${t.table ?? ''}`,
    room: t.table,
    name: t.name || t.service || 'TV',
    serverUrl: t.url,
    where: 'tv' as const,
    code: lanCode(t),
    sub: 'On this Wi-Fi · plays without internet',
    lastUsed: !!t.table && t.table === lastTable,
  })), lastTable);
}

/**
 * Rows for the tables a server lists (`GET /api/tables`), without the ones already found nearby
 * (a table is shown once, where it is nearest).
 *
 * @param tables - the server's tables
 * @param serverUrl - that server
 * @param lastTable - the table this device joined last
 * @param nearby - rows already shown as nearby
 * @returns the rows, last used first, then by name
 */
export function serverRows(tables: readonly TableRow[], serverUrl: string, lastTable: string | null, nearby: readonly PickerRow[] = []): PickerRow[] {
  const seen = new Set(nearby.map((r) => r.room).filter((r): r is string => !!r));
  const where = serverWhere(serverUrl);
  return sortRows(tables.filter((t) => !seen.has(t.room)).map((t) => ({
    key: `srv:${t.room}`,
    room: t.room,
    name: t.tvName || 'TV',
    serverUrl,
    where,
    code: tableCode(t.room),
    sub: companionsText(t.companions),
    lastUsed: t.room === lastTable,
  })), lastTable);
}

/** Last used first, then by name. */
function sortRows(rows: PickerRow[], lastTable: string | null): PickerRow[] {
  return rows.sort((a, b) => Number(b.room === lastTable && !!lastTable) - Number(a.room === lastTable && !!lastTable) || a.name.localeCompare(b.name));
}

/** The words for where a table runs, as its badge says it. */
export const WHERE_LABEL: Record<TableWhere, string> = { tv: 'On the TV', online: 'Online' };

/**
 * The tables a LAN table server lists, as found tables (a typed code names the server only).
 *
 * @param serverUrl - the table server (`http://192.168.1.42:5930`)
 * @param tables - what its `/api/tables` answered
 * @returns found tables for {@link nearbyRows}
 */
export function tablesAt(serverUrl: string, tables: readonly TableRow[]): LanTable[] {
  const u = new URL(serverUrl);
  return tables.map((t) => ({
    service: t.tvName, table: t.room, name: t.tvName, host: u.hostname, port: Number(u.port || 80), url: serverUrl,
  }));
}
