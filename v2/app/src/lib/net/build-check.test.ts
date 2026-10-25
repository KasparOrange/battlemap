/** Tests of {@link newerBuild} (rv#13). */
import { describe, expect, test } from 'bun:test';
import { newerBuild } from './build-check.ts';

const S = 'https://bm.example/';
describe('newerBuild', () => {
  test('a newer build from the server that serves this page', () => {
    expect(newerBuild('b1', 'b2', 'https://bm.example', S, null)).toBe(true);
  });
  test('never for dev, the same build, no build, a build already tried', () => {
    expect(newerBuild('dev', 'b2', 'https://bm.example', S, null)).toBe(false);
    expect(newerBuild('b1', 'b1', 'https://bm.example', S, null)).toBe(false);
    expect(newerBuild('b1', null, 'https://bm.example', S, null)).toBe(false);
    expect(newerBuild('b1', 'b2', 'https://bm.example', S, 'b2')).toBe(false);
  });
  test('never for a page the server does not serve (shell assets)', () => {
    expect(newerBuild('b1', 'b2', 'https://appassets.androidplatform.net', S, null)).toBe(false);
    expect(newerBuild('b1', 'b2', null, S, null)).toBe(false);
    expect(newerBuild('b1', 'b2', 'https://bm.example', 'not a url', null)).toBe(false);
  });
});
