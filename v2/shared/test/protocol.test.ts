/**
 * Message checking: good messages pass, bad ones are refused with a readable reason.
 */
import { describe, expect, test } from 'bun:test';
import {
  checkClientControl, checkCommand, checkRouting, checkServerMessage, initialRoot, parseToCompanion, parseToTv, PROTOCOL_VERSION,
} from '../src/index.ts';

describe('commands', () => {
  test('a good command passes, unknown fields are dropped', () => {
    const r = checkCommand({ type: 'fog.apply', cells: [1, 2], value: 'reveal', gesture: 'g', extra: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ type: 'fog.apply', cells: [1, 2], value: 'reveal', gesture: 'g' });
  });

  test('bad ones say what is wrong', () => {
    const r = checkCommand({ type: 'fog.apply', cells: [1.5], value: 'reveal', gesture: 'g' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('cells');
    expect(checkCommand({ type: 'nope' }).ok).toBe(false);
    expect(checkCommand({ type: 'token.update', id: 't', color: 'red' }).ok).toBe(false);
    expect(checkCommand({ type: 'table.calibrate', widthInches: Number.NaN }).ok).toBe(false);
  });
});

describe('peer messages', () => {
  test('sync.cmd to the TV, with its envelope', () => {
    const r = parseToTv(JSON.stringify({ type: 'sync.cmd', seq: 4, sent: 1, from: 'c1', cmd: { type: 'history.undo' } }));
    expect(r.ok).toBe(true);
    if (r.ok && r.value.type === 'sync.cmd') {
      expect(r.value.seq).toBe(4);
      expect(r.value.from).toBe('c1');
    }
  });

  test('a snapshot carries a whole state', () => {
    const msg = { type: 'sync.snapshot', epoch: 'e1', rev: 0, state: initialRoot(), acks: { c1: 3 } };
    expect(parseToCompanion(JSON.stringify(msg)).ok).toBe(true);
    expect(parseToCompanion(JSON.stringify({ ...msg, state: { ...initialRoot(), table: null } })).ok).toBe(false);
  });

  test('not JSON, or the wrong direction, is refused', () => {
    expect(parseToTv('{oops').ok).toBe(false);
    expect(parseToTv(JSON.stringify({ type: 'sync.snapshot' })).ok).toBe(false);
    expect(parseToCompanion(JSON.stringify({ type: 'sync.cmd', seq: 1, cmd: { type: 'history.undo' } })).ok).toBe(false);
  });
});

describe('server layer', () => {
  test('hello and ping', () => {
    const hello = { type: 'hello', protocol: PROTOCOL_VERSION, role: 'tv', room: 'table1', client: 'tv1', name: 'TV', build: 'dev' };
    expect(checkClientControl(hello).ok).toBe(true);
    expect(checkClientControl({ ...hello, role: 'king' }).ok).toBe(false);
    expect(checkClientControl({ type: 'ping', t: 5 }).ok).toBe(true);
  });

  test('routing reads type, to and seq and keeps the rest', () => {
    const r = checkRouting({ type: 'sync.cmd', to: 'x', seq: 2, cmd: { type: 'history.undo' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cmd).toEqual({ type: 'history.undo' });
    expect(checkRouting({ to: 'x' }).ok).toBe(false);
  });

  test('server messages', () => {
    expect(checkServerMessage({ type: 'welcome', client: 'c', room: 'r', role: 'companion', peers: [], build: null, serverTime: 1 }).ok).toBe(true);
    expect(checkServerMessage({ type: 'replaced', by: 'Other TV' }).ok).toBe(true);
    expect(checkServerMessage({ type: 'sync.cmd' }).ok).toBe(false);
  });
});
