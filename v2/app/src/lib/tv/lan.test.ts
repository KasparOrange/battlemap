import { describe, expect, test } from 'bun:test';
import { lanLogFields, lanQrUrl } from './lan.ts';
import type { LanJoinInfo } from '../config.ts';

const info: LanJoinInfo = {
  hosting: true,
  code: '009A',
  url: 'http://192.168.1.42:5930',
  joinUrl: 'http://192.168.1.42:5930/app/?mode=companion&table=t1',
  qrSvgUrl: 'http://127.0.0.1:5930/api/qr.svg?text=abc',
  error: null,
};

describe('TV LAN join band', () => {
  test('the QR code is asked in the home colours', () => {
    expect(lanQrUrl(info)).toBe('http://127.0.0.1:5930/api/qr.svg?text=abc&dark=%231a1306&light=%23f7f1e4');
  });

  test('no QR code while the table server is down or has no address', () => {
    expect(lanQrUrl({ ...info, hosting: false })).toBeNull();
    expect(lanQrUrl({ ...info, qrSvgUrl: null })).toBeNull();
  });

  test('log fields', () => {
    expect(lanLogFields(null)).toEqual({ hosting: false });
    expect(lanLogFields(info)).toEqual({ hosting: true, code: '009A', url: 'http://192.168.1.42:5930', error: null });
  });
});
