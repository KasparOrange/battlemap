/**
 * The app's one logger. Lines go through mwlog-ts's browser forwarder (batched, 3 s / 50 lines,
 * global error catchers, a flush when the page hides) to the server's `/log`, which ships them
 * to MwLog (tenant `battlemap`, `app=battlemap-v2-ui`) with credentials no device holds. Batches
 * that can't be delivered wait in the localStorage outbox (`log-outbox.ts`). In development the
 * lines are mirrored to the console. Never use `console.log` directly.
 *
 * Usage: `log.info('net', 'Welcomed', { outageMs })` — area, message, props.
 *
 * @see ../../../docs/architecture.md "logs"
 */
import { createBrowserLog, type BrowserLog } from 'mwlog/browser';
import { appConfig } from './config.ts';
import { createOutbox } from './log-outbox.ts';
import { onShellEvent, takeShellLogs } from './shell.ts';

/** What every module needs from a logger (the browser forwarder has more). */
export interface Logger {
  /** Mechanics. */
  debug(area: string, msg: string, props?: Record<string, unknown>): void;
  /** An action or a state change. */
  info(area: string, msg: string, props?: Record<string, unknown>): void;
  /** Degraded, refused, retried. */
  warn(area: string, msg: string, props?: Record<string, unknown>): void;
  /** Broken. */
  error(area: string, msg: string, props?: Record<string, unknown>): void;
  /** One summary line per 10 s for things that happen often (sums of `nums`, call count). */
  count?(area: string, msg: string, fixed?: Record<string, unknown>, nums?: Record<string, number>): void;
}

const config = appConfig();

/** The outbox behind the logger (exposed for the health line). */
export const logOutbox = createOutbox({
  endpoint: `${config.serverUrl}/log`,
  storage: (() => {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  })(),
});

/** The logger. */
export const log: BrowserLog = createBrowserLog({
  send: (lines) => logOutbox.send(lines),
  console: Boolean(import.meta.env?.DEV),
  context: {
    build: config.build,
    role: config.mode ?? 'start',
    deviceId: config.deviceId,
    deviceName: config.deviceName,
    client: config.clientId,
    table: config.tableId ?? undefined,
  },
});

let forwarding = false;

/**
 * Starts forwarding the Android shell's own log lines (what it buffered before the page, then
 * each live `log` event) into this logger, area `shell`. Does nothing outside the shell.
 */
export function forwardShellLogs(): void {
  if (forwarding) return;
  forwarding = true;
  for (const line of takeShellLogs()) log.log(line.level, 'shell', line.msg, { shellTs: line.t });
  onShellEvent((detail) => {
    if (detail.type === 'log') log.log(detail.line.level, 'shell', detail.line.msg, { shellTs: detail.line.t });
  });
}
