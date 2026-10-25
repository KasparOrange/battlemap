/// <reference types="bun" />
/**
 * TV screen rules: the problem badge (nothing while all is well, priorities), the home badge,
 * where Back goes, the Back debounce, and the "ago" phrases.
 */
import { describe, expect, test } from 'bun:test';
import { ago, backAction, backGate, homeBadge, OFFLINE_RED_MS, problemBadge, screenFor } from './screen.ts';

const ok = { connection: 'open' as const, companions: 1, problem: null, offlineMs: 0 };

describe('badge', () => {
  test('nothing while all is well', () => {
    expect(problemBadge(ok)).toBeNull();
  });

  test('priorities: error, replaced, refused, offline, no tablet', () => {
    expect(problemBadge({ ...ok, problem: 'Save failed', connection: 'replaced' })?.text).toBe('Save failed');
    expect(problemBadge({ ...ok, connection: 'replaced' })).toMatchObject({ tone: 'danger', takeOver: true });
    expect(problemBadge({ ...ok, connection: 'refused' })?.tone).toBe('danger');
    expect(problemBadge({ ...ok, connection: 'waiting', offlineMs: 1000 })).toMatchObject({ text: 'Connecting to the server…', tone: 'warn' });
    expect(problemBadge({ ...ok, connection: 'waiting', offlineMs: OFFLINE_RED_MS })).toMatchObject({ tone: 'danger' });
    expect(problemBadge({ ...ok, companions: 0 })).toMatchObject({ text: 'Tablet not connected', tone: 'warn' });
  });

  test('home says when the tablet is there', () => {
    expect(homeBadge(ok)).toMatchObject({ text: 'Tablet connected', tone: 'ok' });
    expect(homeBadge({ ...ok, companions: 2 }).text).toBe('2 tablets connected');
    expect(homeBadge({ ...ok, companions: 0 }).text).toBe('Waiting for the tablet');
  });
});

describe('navigation', () => {
  test('a game always shows', () => {
    expect(screenFor(true, 'home')).toBe('game');
    expect(screenFor(false, 'library')).toBe('library');
  });

  test('back targets', () => {
    expect(backAction('game', true)).toBe('pattern-off');
    expect(backAction('game', false)).toBe('close-game');
    expect(backAction('library', false)).toBe('home');
    expect(backAction('home', false)).toBe('exit');
  });

  test('back is debounced 400 ms', () => {
    let t = 0;
    const gate = backGate(() => t);
    expect(gate.accept()).toBe(true);
    t = 300;
    expect(gate.accept()).toBe(false);
    t = 800;
    expect(gate.accept()).toBe(true);
  });
});

test('ago', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  expect(ago('2026-10-25T11:59:30Z', now)).toBe('just now');
  expect(ago('2026-10-25T10:00:00Z', now)).toBe('2 hours ago');
  expect(ago('2026-10-24T10:00:00Z', now)).toBe('yesterday');
  expect(ago('2026-10-04T12:00:00Z', now)).toBe('3 weeks ago');
});
