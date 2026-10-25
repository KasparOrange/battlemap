/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { wholeGrid, type GameSummary, type LibraryEntry, type MapInfo } from '@battlemap/shared';
import {
  ago, continueGame, defaultGameName, groupGames, fileUrl, formatBytes, gameMeta, mapMeta, matchesSearch, nameFromFile, newestFirst,
  shortDate, visibleEntries,
} from './library-logic.ts';
import { followingRows } from './grid-guess.ts';

const now = new Date('2026-10-10T20:00:00');

function game(id: string, savedAt: string, map = 'Cave'): GameSummary {
  return { id, name: `G ${id}`, createdAt: savedAt, savedAt, mapNames: [map], activeMapName: map, thumb: null, where: 'tv' };
}

function map(over: Partial<MapInfo> = {}): MapInfo {
  return {
    id: 'm1', name: 'Cave', kind: 'picture', picture: { hash: 'a'.repeat(16), ext: 'webp', bytes: 3_200_000 },
    tableCopy: null, geometry: null, grid: wholeGrid(40, 30, 1280, 960), drawGrid: true, doorCount: 0, drawDoors: false,
    libraryId: null, ...over,
  };
}

describe('names and dates', () => {
  test('short date, year only when another year', () => {
    expect(shortDate(new Date('2026-10-10T12:00:00'), now)).toBe('Sat 10 Oct');
    expect(shortDate(new Date('2025-01-03T12:00:00'), now)).toBe('Fri 3 Jan 2025');
  });
  test('default name counts games on the map', () => {
    const games = [game('1', '2026-10-01T10:00:00Z'), game('2', '2026-10-02T10:00:00Z'), game('3', '2026-10-02T10:00:00Z', 'Tower')];
    expect(defaultGameName('Cave', games, now)).toBe('Session 3 · Sat 10 Oct');
    expect(defaultGameName('Marsh', games, now)).toBe('Session 1 · Sat 10 Oct');
  });
  test('ago', () => {
    expect(ago(new Date(now.getTime() - 20_000).toISOString(), now)).toBe('just now');
    expect(ago(new Date(now.getTime() - 12 * 60_000).toISOString(), now)).toBe('12 min ago');
    expect(ago(new Date(now.getTime() - 2 * 3600_000).toISOString(), now)).toBe('2 h ago');
    expect(ago(new Date(now.getTime() - 3 * 86_400_000).toISOString(), now)).toBe('3 d ago');
    expect(ago('2026-09-01T12:00:00', now)).toBe('Tue 1 Sep');
    expect(ago('nonsense', now)).toBe('');
  });
  test('name from file', () => {
    expect(nameFromFile('cave_level_40x30.webp')).toBe('Cave level');
    expect(nameFromFile('Tower-of-Ash.png')).toBe('Tower of Ash');
    expect(nameFromFile('40x30.png')).toBe('Map');
  });
});

describe('lists', () => {
  test('continue = last saved; newest first', () => {
    const games = [game('a', '2026-10-01T10:00:00Z'), game('b', '2026-10-09T10:00:00Z'), game('c', '2026-10-05T10:00:00Z')];
    expect(continueGame(games)?.id).toBe('b');
    expect(continueGame([])).toBeNull();
    expect(newestFirst(games).map((g) => g.id)).toEqual(['b', 'c', 'a']);
  });
  test('search: every word, accents and case ignored', () => {
    expect(matchesSearch('The Sunless Citadel', 'sun cit')).toBe(true);
    expect(matchesSearch('Château d’If', 'chateau')).toBe(true);
    expect(matchesSearch('Salt Marsh', 'tower')).toBe(false);
    expect(matchesSearch('anything', '  ')).toBe(true);
  });
  test('shared entries filtered and newest first', () => {
    const e = (id: string, name: string, at: string): LibraryEntry => ({ map: map({ id, name }), thumb: null, addedAt: at, originalBytes: null, note: null });
    const list = [e('1', 'Cave', '2026-10-01T00:00:00Z'), e('2', 'Cave deep', '2026-10-03T00:00:00Z'), e('3', 'Tower', '2026-10-02T00:00:00Z')];
    expect(visibleEntries(list, 'cave').map((x) => x.map.id)).toEqual(['2', '1']);
  });
});

describe('meta lines', () => {
  test('bytes', () => {
    expect(formatBytes(3_200_000)).toBe('3.2 MB');
    expect(formatBytes(640_000)).toBe('640 KB');
    expect(formatBytes(512)).toBe('512 B');
  });
  test('map and game meta', () => {
    expect(mapMeta(map())).toBe('40 × 30 squares · WebP · 3.2 MB');
    expect(mapMeta(map({ kind: 'uvtt' }))).toBe('40 × 30 squares · Dungeondraft map · 3.2 MB');
    expect(gameMeta(game('x', new Date(now.getTime() - 7200_000).toISOString()), now)).toBe('Cave · 2 h ago');
  });
  test('file url', () => {
    expect(fileUrl('http://h:1/', { hash: 'ab'.repeat(8), ext: 'png', bytes: 1 })).toBe(`http://h:1/files/${'ab'.repeat(8)}.png`);
  });
});

describe('rows follow', () => {
  test('square squares', () => {
    expect(followingRows(40, 1280, 960)).toBe(30);
    expect(followingRows(1, 100, 10)).toBe(1);
  });
});

describe('continue card and groups (qa#7)', () => {
  const g = (id: string, savedAt: string, where: GameSummary['where']): GameSummary => ({ ...game(id, savedAt), where });
  const games = [
    g('mine', '2026-10-09T10:00:00Z', 'tv'),
    g('other', '2026-10-10T10:00:00Z', 'server'),
    g('both', '2026-10-08T10:00:00Z', 'both'),
    g('older', '2026-10-01T10:00:00Z', 'server'),
  ];
  test('Continue never offers a server-only backup', () => {
    expect(continueGame(games)?.id).toBe('mine');
    expect(continueGame([games[1]!])).toBeNull();
  });
  test('this TV\'s games first, backups in their own group, newest first', () => {
    const r = groupGames(games, '');
    expect(r.cont?.id).toBe('mine');
    expect(r.onTv.map((x) => x.id)).toEqual(['both']);
    expect(r.backups.map((x) => x.id)).toEqual(['other', 'older']);
  });
  test('the search filters every group', () => {
    const r = groupGames(games, 'G other');
    expect(r.cont).toBeNull();
    expect(r.onTv).toEqual([]);
    expect(r.backups.map((x) => x.id)).toEqual(['other']);
  });
});
