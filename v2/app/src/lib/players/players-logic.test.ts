/**
 * The players' page's pure parts (S12).
 */
import { describe, expect, test } from 'bun:test';
import { initialRoot } from '@battlemap/shared';
import { fitBox, playersLink, readPlayersMessage, roomForCode, stateForBox } from './players-logic.ts';

describe('players page logic', () => {
  test('the box keeps the TV\'s shape', () => {
    expect(fitBox({ width: 390, height: 844 }, { width: 1920, height: 1080 })).toEqual({ width: 390, height: 219 });
    expect(fitBox({ width: 2000, height: 1000 }, { width: 1920, height: 1080 })).toEqual({ width: 1777, height: 1000 });
    expect(fitBox({ width: 800, height: 600 }, null)).toEqual({ width: 800, height: 450 });
  });

  test('the drawn state gets the box as its viewport and nothing else changes', () => {
    const s = initialRoot();
    const d = stateForBox(s, { width: 390, height: 219 });
    expect(d.table.viewport).toEqual({ width: 390, height: 219 });
    expect(d.table.widthInches).toBe(s.table.widthInches);
    expect(s.table.viewport).toBeNull();
  });

  test('only a players.state message is read', () => {
    expect(readPlayersMessage({ type: 'players.state', rev: 2, state: initialRoot() })?.rev).toBe(2);
    expect(readPlayersMessage({ type: 'sync.snapshot', rev: 2, state: initialRoot() })).toBeNull();
    expect(readPlayersMessage({ type: 'players.state', rev: 2, state: { nope: 1 } })).toBeNull();
  });

  test('a table by its code; none or two matches give null', () => {
    const tables = [{ room: 'table-yf6kig4q' }, { room: 'table-abcd1234' }, { room: 'other-xx1234' }];
    expect(roomForCode(tables, 'ig4q')).toBe('table-yf6kig4q');
    expect(roomForCode(tables, ' IG 4Q ')).toBe('table-yf6kig4q');
    expect(roomForCode(tables, '1234')).toBeNull();
    expect(roomForCode(tables, 'zzzz')).toBeNull();
    expect(roomForCode(tables, '')).toBeNull();
  });

  test('the players\' link', () => {
    expect(playersLink('https://bm.example/app/?mode=companion&table=x', 'table-1')).toBe('https://bm.example/app/?mode=players&table=table-1');
    expect(playersLink('http://192.168.1.5:5930/app/', 'table-1', 'http://192.168.1.5:5930')).toBe('http://192.168.1.5:5930/app/?mode=players&table=table-1');
    expect(playersLink('http://localhost:5884/app/', 't', 'http://localhost:5929')).toBe('http://localhost:5884/app/?mode=players&table=t&server=http%3A%2F%2Flocalhost%3A5929');
  });
});
