import { describe, expect, test } from 'bun:test';
import type { FileRef, TileManifest } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import { memoryPorts } from './memory-ports.ts';
import { deviceTileSets, tileSetKey } from './tile-sets.ts';

const quiet: Logger = { debug() {}, info() {}, warn() {}, error() {} } as unknown as Logger;
const picture: FileRef = { hash: 'b'.repeat(64), ext: 'jpg', bytes: 5 };
const set: TileManifest = {
  v: 1, source: picture, sourceW: 600, sourceH: 400, level: 0, width: 600, height: 400, tile: 512, apron: 1, cols: 2, rows: 1,
  tiles: [{ hash: '1'.repeat(64), ext: 'webp', bytes: 9 }, { hash: '2'.repeat(64), ext: 'webp', bytes: 9 }],
  preview: { hash: '3'.repeat(64), ext: 'webp', bytes: 9 },
};

describe('the TV keeps tile sets', () => {
  test('asks the server once, then answers from the device (offline)', async () => {
    const ports = memoryPorts();
    let asked = 0;
    const load = deviceTileSets({ settings: ports.settings, log: quiet, fetch: async () => (asked++, set) });
    expect(await load(picture, 0)).toEqual(set);
    expect(ports.setting.get(tileSetKey(picture, 0))).toEqual(set);
    const offline = deviceTileSets({ settings: ports.settings, log: quiet, fetch: async () => { throw new Error('offline'); } });
    expect(await offline(picture, 0)).toEqual(set);
    expect(asked).toBe(1);
  });

  test('a server without tiles answers null and nothing is kept; a broken kept set is asked again', async () => {
    const ports = memoryPorts();
    expect(await deviceTileSets({ settings: ports.settings, log: quiet, fetch: async () => null })(picture, 1)).toBeNull();
    expect(ports.setting.has(tileSetKey(picture, 1))).toBe(false);
    ports.setting.set(tileSetKey(picture, 2), { v: 1, tiles: [] });
    expect(await deviceTileSets({ settings: ports.settings, log: quiet, fetch: async () => set })(picture, 2)).toEqual(set);
  });
});
