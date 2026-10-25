/// <reference types="bun" />
/**
 * `.battlemap` export / import: round trip, file discovery, ref rewriting, copies, and the
 * refusals for files that aren't bundles, are newer, or are cut short. Run: `bun test`.
 */
import { describe, expect, test } from 'bun:test';
import type { FileRef, Game } from '@battlemap/shared';
import { recordingLog } from '../../../test/helpers.ts';
import { bundleName, exportGame, gameFileRefs, importGame, readGameBundle, remapRefs } from './bundle.ts';
import { gameWith, mapWith, refFor } from './testing.ts';

/** Bytes for a ref: its seed letter repeated, so content is checkable. */
function bytesFor(ref: FileRef): Blob {
  return new Blob([new Uint8Array(ref.bytes).fill(ref.hash.charCodeAt(0))]);
}

/** A game with two maps, a geometry file, a DM layer, and one picture used twice. */
function richGame(): Game {
  const pic = refFor('p1', 300);
  const geo = refFor('g1', 40, 'json');
  const layer = refFor('l1', 120, 'webp');
  const g = gameWith('rich', pic);
  const m2 = mapWith('m2', pic, geo);
  g.mapOrder.push('m2');
  g.maps['m2'] = { ...structuredClone(g.maps['m-rich']!), info: m2 };
  g.maps['m2'].layers = [{ id: 'ly', name: 'secret.webp', file: layer, visible: true, opacity: 1 }];
  return g;
}

const files = () => ({ getFile: async (ref: FileRef) => bytesFor(ref), log: recordingLog(), build: 'test-build', now: () => new Date('2026-10-25T12:00:00Z') });

describe('bundle', () => {
  test('finds every file once', () => {
    const refs = gameFileRefs(richGame());
    expect(refs.map((r) => r.ext).sort()).toEqual(['json', 'png', 'webp']);
  });

  test('export → read gives back the game and every file byte for byte', async () => {
    const game = richGame();
    const progress: number[] = [];
    const { blob, name } = await exportGame(game, files(), (d) => progress.push(d));
    expect(name).toBe('Game rich.battlemap');
    expect(progress.at(-1)).toBe(460);
    expect((await blob.slice(0, 20).text()).startsWith('battlemap-game 1 ')).toBe(true);
    const back = await readGameBundle(blob);
    expect(back.game).toEqual(game);
    expect(back.build).toBe('test-build');
    expect(back.exportedAt).toBe('2026-10-25T12:00:00.000Z');
    expect(back.files.length).toBe(3);
    for (const f of back.files) {
      const want = new Uint8Array(await bytesFor(f.ref).arrayBuffer());
      expect(new Uint8Array(await f.blob.arrayBuffer())).toEqual(want);
    }
  });

  test('import uploads, keeps, backs up; same hashes keep the refs', async () => {
    const game = richGame();
    const { blob } = await exportGame(game, files());
    const uploaded: string[] = [];
    const kept: string[] = [];
    let backedUp: Game | null = null;
    const out = await importGame(blob, {
      upload: async (b, ref) => { uploaded.push(ref.hash); expect(b.size).toBe(ref.bytes); return ref; },
      keep: async (ref) => void kept.push(ref.hash),
      backup: async (g) => { backedUp = g; },
      log: recordingLog(),
    });
    expect(out).toEqual(game);
    expect(uploaded.length).toBe(3);
    expect(kept).toEqual(uploaded);
    expect(backedUp!).toEqual(game);
  });

  test('a server that hashes differently gets its refs written into the game', async () => {
    const game = richGame();
    const { blob } = await exportGame(game, files());
    const log = recordingLog();
    const out = await importGame(blob, {
      upload: async (_b, ref) => ({ ...ref, hash: ref.hash.replace(/^../, 'ff') }),
      log,
    }, undefined, { asCopy: true });
    for (const r of gameFileRefs(out)) expect(r.hash.startsWith('ff')).toBe(true);
    expect(out.id).not.toBe(game.id);
    expect(out.name).toBe('Game rich (copy)');
    expect(log.has('Import: the server hashed files differently — refs rewritten')).toBe(true);
  });

  test('remapRefs leaves the input alone', () => {
    const game = richGame();
    const before = structuredClone(game);
    const ref = gameFileRefs(game)[0]!;
    const out = remapRefs(game, new Map([[`${ref.hash}.${ref.ext}`, { ...ref, hash: 'a'.repeat(16) }]]));
    expect(game).toEqual(before);
    expect(gameFileRefs(out).some((r) => r.hash === 'a'.repeat(16))).toBe(true);
  });

  test('refuses what is not a bundle, a newer one, a cut one, a damaged header', async () => {
    const game = gameWith('x');
    const { blob } = await exportGame(game, files());
    await expect(readGameBundle(new Blob(['{"hello":1}']))).rejects.toThrow('not a battlemap game file');
    const text = await blob.text();
    await expect(readGameBundle(new Blob([text.replace('battlemap-game 1', 'battlemap-game 9')]))).rejects.toThrow('newer battlemap');
    await expect(readGameBundle(blob.slice(0, blob.size - 1))).rejects.toThrow('cut short');
    const header = text.split('\n')[0]!;
    await expect(readGameBundle(new Blob([`${header}\n${'x'.repeat(Number(header.split(' ')[2]))}`]))).rejects.toThrow('damaged');
  });

  test('bundleName makes a safe file name', () => {
    expect(bundleName('Session 3 · Sat 10 Oct')).toBe('Session 3 Sat 10 Oct.battlemap');
    expect(bundleName('../../etc')).toBe('.. .. etc.battlemap');
    expect(bundleName('')).toBe('game.battlemap');
  });
});
