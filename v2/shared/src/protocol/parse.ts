/**
 * Checking what arrives: text → JSON → a typed message, or a readable error. Every receiver
 * goes through these; nothing trusts the wire.
 */
import * as v from 'valibot';
import { Command } from './commands.ts';
import { ClientControl, RoutingEnvelope, ServerMessage, ToCompanion, ToTv } from './messages.ts';

/** The result of checking something: the typed value, or why it was refused. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Parses JSON text without throwing.
 *
 * @param text - the text
 * @returns the value, or a refusal for text that isn't JSON
 */
export function parseJson(text: string): Parsed<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    return { ok: false, error: `not JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Checks a value against a schema.
 *
 * @param schema - the valibot schema
 * @param value - the value
 * @returns the typed value, or the first three problems with their paths
 */
export function check<S extends v.GenericSchema>(schema: S, value: unknown): Parsed<v.InferOutput<S>> {
  const result = v.safeParse(schema, value);
  if (result.success) return { ok: true, value: result.output };
  const problems = result.issues.slice(0, 3).map((issue) => {
    const path = v.getDotPath(issue);
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return { ok: false, error: problems.join('; ') };
}

/**
 * A message for the TV, from JSON text.
 *
 * @param text - the raw message
 * @returns the typed message or a refusal
 */
export function parseToTv(text: string): Parsed<ToTv> {
  const json = parseJson(text);
  return json.ok ? check(ToTv, json.value) : json;
}

/**
 * A message for a companion, from JSON text.
 *
 * @param text - the raw message
 * @returns the typed message or a refusal
 */
export function parseToCompanion(text: string): Parsed<ToCompanion> {
  const json = parseJson(text);
  return json.ok ? check(ToCompanion, json.value) : json;
}

/**
 * A message the server sent of its own, from an already parsed value (clients parse once and
 * then try the server's messages before the peer ones).
 *
 * @param value - the parsed JSON
 * @returns the typed message or a refusal
 */
export function checkServerMessage(value: unknown): Parsed<ServerMessage> {
  return check(ServerMessage, value);
}

/**
 * A control message for the server (`hello`, `ping`).
 *
 * @param value - the parsed JSON
 * @returns the typed message or a refusal
 */
export function checkClientControl(value: unknown): Parsed<ClientControl> {
  return check(ClientControl, value);
}

/**
 * The routing part of a peer message (what the server reads).
 *
 * @param value - the parsed JSON
 * @returns the envelope or a refusal
 */
export function checkRouting(value: unknown): Parsed<RoutingEnvelope> {
  return check(RoutingEnvelope, value);
}

/**
 * A command on its own (tests, tools).
 *
 * @param value - the parsed JSON
 * @returns the typed command or a refusal
 */
export function checkCommand(value: unknown): Parsed<Command> {
  return check(Command, value);
}

/** The server-message types, to tell them from relayed peer messages before checking. */
export const SERVER_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'welcome', 'pong', 'peer.joined', 'peer.left', 'replaced', 'relay.undelivered', 'server.build', 'server.error',
]);
