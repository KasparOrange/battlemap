/**
 * When the companion registers its service worker (S23).
 */
import { describe, expect, test } from 'bun:test';
import { wantsServiceWorker } from './pwa.ts';

describe('service worker choice', () => {
  const base = { mode: 'companion' as const, inShell: false, production: true, supported: true };
  test('the companion and the start screen in a browser register it', () => {
    expect(wantsServiceWorker(base)).toBe(true);
    expect(wantsServiceWorker({ ...base, mode: null })).toBe(true);
  });
  test('never the TV, the players\' view, the shell, a dev build or an old browser', () => {
    expect(wantsServiceWorker({ ...base, mode: 'tv' })).toBe(false);
    expect(wantsServiceWorker({ ...base, mode: 'players' })).toBe(false);
    expect(wantsServiceWorker({ ...base, inShell: true })).toBe(false);
    expect(wantsServiceWorker({ ...base, production: false })).toBe(false);
    expect(wantsServiceWorker({ ...base, supported: false })).toBe(false);
  });
});
