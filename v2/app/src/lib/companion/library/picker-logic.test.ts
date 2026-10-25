/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { nearbyRows, serverRows, serverWhere, tablesAt } from './picker-logic.ts';

const lan = (name: string, table: string | null, host = '192.168.1.42') => ({ service: name, table, name, host, port: 5930, url: `http://${host}:5930` });

describe('table picker rows', () => {
  test('nearby tables run on the TV, carry its address code, last used first', () => {
    const rows = nearbyRows([lan('Wohnzimmer', 'table-aaaa1111'), lan('Attic', 'table-bbbb2222', '192.168.1.7')], 'table-aaaa1111');
    expect(rows.map((r) => [r.name, r.where, r.code, r.lastUsed])).toEqual([
      ['Wohnzimmer', 'tv', '009A', true],
      ['Attic', 'tv', '0087', false],
    ]);
    expect(rows[0]!.serverUrl).toBe('http://192.168.1.42:5930');
  });

  test('online tables: where from the server, table codes, and a table found nearby is shown once', () => {
    const nearby = nearbyRows([lan('Box', 'table-x1')], null);
    const rows = serverRows(
      [{ room: 'table-x1', tvName: 'Box', companions: 0 }, { room: 'table-yf6kig4q', tvName: 'Juri', companions: 2 }],
      'https://battlemap.example.org', null, nearby,
    );
    expect(rows.map((r) => [r.name, r.where, r.code, r.sub])).toEqual([['Juri', 'online', 'IG4Q', '2 tablets connected']]);
    expect(serverRows([{ room: 'r1', tvName: '', companions: 1 }], 'http://192.168.1.42:5930', 'r1')[0]).toMatchObject({ name: 'TV', where: 'tv', lastUsed: true, sub: '1 tablet connected' });
  });

  test('where a server runs its games', () => {
    expect(serverWhere('http://192.168.1.42:5930')).toBe('tv');
    expect(serverWhere('http://box.local:5930')).toBe('tv');
    expect(serverWhere('http://localhost:5929')).toBe('online'); // a development server
    expect(serverWhere('https://battlemap.srv1189697.hstgr.cloud')).toBe('online');
  });

  test('a typed code: the TV server\'s tables become nearby tables', () => {
    const found = tablesAt('http://192.168.1.42:5930', [{ room: 'table-q', tvName: 'Box', companions: 0 }]);
    expect(nearbyRows(found, null)[0]).toMatchObject({ room: 'table-q', serverUrl: 'http://192.168.1.42:5930', code: '009A' });
  });
});
