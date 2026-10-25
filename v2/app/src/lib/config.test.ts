import { describe, expect, test } from 'bun:test';
import { decodeLanCode, encodeLanCode, isLanUrl, joinUrlFor, readConfig } from './config.ts';

describe('LAN codes', () => {
  test('192.168.x.y is 4 characters, other addresses 7, a port follows when it is not 5930', () => {
    expect(encodeLanCode('192.168.1.42')).toBe('009A');
    expect(encodeLanCode('10.0.0.7')).toBe('0500007');
    expect(encodeLanCode('10.0.2.2', 15930)).toBe('05000G2-15930');
    expect(encodeLanCode('300.1.1.1')).toBeNull();
  });

  test('codes, addresses and URLs read back to the server URL', () => {
    for (const ip of ['192.168.0.1', '192.168.178.20', '192.168.255.255', '10.0.2.2', '172.16.5.4', '100.101.102.103']) {
      expect(decodeLanCode(encodeLanCode(ip)!)).toBe(`http://${ip}:5930`);
      expect(decodeLanCode(encodeLanCode(ip, 6000)!)).toBe(`http://${ip}:6000`);
    }
    expect(decodeLanCode(' 009a ')).toBe('http://192.168.1.42:5930');
    expect(decodeLanCode('OO9A')).toBe('http://192.168.1.42:5930'); // O read as 0
    expect(decodeLanCode('192.168.1.42')).toBe('http://192.168.1.42:5930');
    expect(decodeLanCode('10.0.2.2:15930')).toBe('http://10.0.2.2:15930');
    expect(decodeLanCode('http://192.168.1.42:5930/app/?mode=companion')).toBe('http://192.168.1.42:5930');
    expect(decodeLanCode('battlemap.local')).toBe('http://battlemap.local:5930');
    expect(decodeLanCode('')).toBeNull();
    expect(decodeLanCode('hello world')).toBeNull();
    expect(decodeLanCode('UUUU')).toBeNull(); // U isn't in the alphabet
  });

  test('LAN URLs', () => {
    expect(isLanUrl('http://192.168.1.42:5930')).toBe(true);
    expect(isLanUrl('http://127.0.0.1:5930')).toBe(true);
    expect(isLanUrl('http://10.0.2.2:15930')).toBe(true);
    expect(isLanUrl('https://battlemap.srv1189697.hstgr.cloud')).toBe(false);
  });
});

describe('server choice', () => {
  test('a TV hosting the table talks to its own server, the shell-configured one is home', () => {
    const c = readConfig(new URL('https://appassets.androidplatform.net/app/index.html?mode=tv&device=abcdefgh-1&server=http%3A%2F%2F127.0.0.1%3A5930&upstream=https%3A%2F%2Fvps.example'));
    expect(c.serverUrl).toBe('http://127.0.0.1:5930');
    expect(c.homeServerUrl).toBe('https://vps.example');
    expect(c.lan).toBe(true);
    expect(c.wsUrl).toBe('ws://127.0.0.1:5930/ws');
  });

  test('a browser page on the VPS uses its origin; on a table server, the box', () => {
    const vps = readConfig(new URL('https://vps.example/app/?mode=companion'));
    expect([vps.serverUrl, vps.homeServerUrl, vps.lan]).toEqual(['https://vps.example', 'https://vps.example', false]);
    const box = readConfig(new URL('http://192.168.1.42:5930/app/?mode=companion&table=t1'));
    expect([box.serverUrl, box.lan, box.tableId]).toEqual(['http://192.168.1.42:5930', true, 't1']);
  });

  test('joining a LAN table from an https page in a browser opens the box’s own app', () => {
    const url = new URL(joinUrlFor('http://192.168.1.42:5930', 'table-1', new URL('https://vps.example/app/?mode=companion')));
    expect(url.origin).toBe('http://192.168.1.42:5930');
    expect(url.pathname).toBe('/app/');
    expect(url.searchParams.get('table')).toBe('table-1');
    expect(url.searchParams.get('server')).toBe('http://192.168.1.42:5930');
    const internet = new URL(joinUrlFor('https://vps.example', 'table-2', new URL('https://vps.example/app/?mode=companion')));
    expect(internet.origin).toBe('https://vps.example');
  });
});
