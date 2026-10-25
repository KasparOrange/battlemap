/**
 * The temp cleanup and the proxy-aware client address.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init } from 'mwlog';
import { cleanup } from '../src/cleanup.ts';
import { clientIp } from '../src/server.ts';

describe('cleanup', () => {
  test('old link fetches, old trash and stale temp files go; the store and fresh files stay', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-v2-server-clean-'));
    const log = init({ app: 'battlemap-v2-test', tenant: 'battlemap', console: false, hooks: false, stateDir: join(dir, 'state') });
    for (const sub of ['uploads', 'trash/game-old-1', 'trash/game-new-2', 'files']) mkdirSync(join(dir, sub), { recursive: true });
    const old = (Date.now() - 40 * 86_400_000) / 1000;
    const touch = (path: string, aged: boolean) => {
      writeFileSync(path, 'x');
      if (aged) utimesSync(path, old, old);
    };
    touch(join(dir, 'uploads', 'aaaaaaaaaaaa.png'), true);
    touch(join(dir, 'uploads', 'bbbbbbbbbbbb.png'), false);
    utimesSync(join(dir, 'trash', 'game-old-1'), old, old);
    touch(join(dir, 'files', `${'a'.repeat(64)}.png`), true);
    touch(join(dir, 'files', 'x.png.1.1.tmp'), true);
    touch(join(dir, 'library.json.1.2.tmp'), true);
    const result = await cleanup(dir, { uploadDays: 7, trashDays: 30 }, log);
    expect(result).toEqual({ uploads: 1, trash: 1, tmp: 2 });
    expect(existsSync(join(dir, 'uploads', 'bbbbbbbbbbbb.png'))).toBe(true);
    expect(existsSync(join(dir, 'trash', 'game-new-2'))).toBe(true);
    expect(existsSync(join(dir, 'files', `${'a'.repeat(64)}.png`))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('client address', () => {
  test('behind the proxy the forwarded address counts; from the internet the peer does', () => {
    const req = (xff?: string) => new Request('http://x/', { headers: xff ? { 'x-forwarded-for': xff } : {} });
    expect(clientIp(req('203.0.114.9, 85.1.2.3'), '172.19.0.5')).toBe('85.1.2.3');
    expect(clientIp(req(), '::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(clientIp(req('10.0.0.1'), '85.1.2.3')).toBe('85.1.2.3');
  });
});
