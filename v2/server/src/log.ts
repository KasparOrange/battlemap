/**
 * The server's logger: logbook-ts, tenant `battlemap`, app `battlemap-v2` (the UI's lines it
 * forwards arrive as `battlemap-v2-ui`). Credentials from `~/.config/logbook/battlemap.env` (or the
 * environment on the VPS); `LOGBOOK_DISABLE=1` keeps tests from shipping anything.
 */
import { init, type Logbook } from 'logbook';

/** The logger type every server module takes. */
export type ServerLog = Logbook;

/**
 * Creates the logger (once per process).
 *
 * @param start - settings for the `start` line (port, dirs — never secrets)
 * @returns the logger
 */
export function createLog(start: Record<string, unknown>): ServerLog {
  return init({ app: 'battlemap-v2', tenant: 'battlemap', version: '0.1.0', start });
}
