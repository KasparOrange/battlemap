/**
 * The Sound tab's rules: a tap on a bed (in, out, full), a bed's volume, the commands, the pad
 * order with favourites, the groups, the summary line — and that the shipped library's
 * catalogue fits them (every bed in a known group, every effects id real, licences fine).
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultSoundscape, MAX_BEDS, checkCommand } from '@battlemap/shared';
import { makeCatalogue, type SoundEntry } from '../../../sound/catalogue.ts';
import { BED_GROUPS, bedsOf, NEW_BED_VOLUME, padOrder, percent, setBedVolume, soundLine, soundPlay, soundSet, toggleBed } from './sound-logic.ts';

const entry = (id: string, kind: SoundEntry['kind'], group: string): SoundEntry =>
  ({ id, kind, group, name: id.toUpperCase(), file: `${kind}/${id}.ogg` }) as SoundEntry;

describe('the mix', () => {
  test('a tap adds a bed at the start volume, a second tap takes it out', () => {
    const added = toggleBed([], 'rain');
    expect(added).toEqual({ kind: 'added', beds: [{ sound: 'rain', volume: NEW_BED_VOLUME }] });
    expect(toggleBed(added.kind === 'added' ? added.beds : [], 'rain')).toEqual({ kind: 'removed', beds: [] });
  });

  test('a fourth bed is refused, the mix unchanged', () => {
    const beds = ['a', 'b', 'c'].map((sound) => ({ sound, volume: 0.5 }));
    expect(beds.length).toBe(MAX_BEDS);
    expect(toggleBed(beds, 'd')).toEqual({ kind: 'full' });
    expect(toggleBed(beds, 'b')).toEqual({ kind: 'removed', beds: [beds[0]!, beds[2]!] });
  });

  test('a volume change touches one bed, rounded and clamped', () => {
    const beds = [{ sound: 'rain', volume: 0.5 }, { sound: 'campfire', volume: 0.5 }];
    expect(setBedVolume(beds, 'rain', 0.333)).toEqual([{ sound: 'rain', volume: 0.33 }, beds[1]!]);
    expect(setBedVolume(beds, 'rain', 3)[0]!.volume).toBe(1);
    expect(setBedVolume(beds, 'nope', 0.1)).toEqual(beds);
  });
});

describe('commands', () => {
  test('sound.set carries only the fields given and parses', () => {
    const cmd = soundSet({ master: 0.4 });
    expect(cmd).toEqual({ type: 'sound.set', master: 0.4 } as never);
    expect(checkCommand(cmd).ok).toBe(true);
  });

  test('sound.play stamps the shot with the given clock and parses', () => {
    const cmd = soundPlay('thunder', 'shot-1', 1234);
    expect(cmd).toEqual({ type: 'sound.play', shot: { id: 'shot-1', sound: 'thunder', volume: 1, at: 1234 } });
    expect(checkCommand(cmd).ok).toBe(true);
  });
});

describe('pads and groups', () => {
  const shots = ['door-creak', 'thunder', 'coin'].map((id) => entry(id, 'oneshot', 'x'));

  test('favourites first in starred order, unknown stars skipped, then the rest', () => {
    expect(padOrder(shots, ['coin', 'gone', 'door-creak']).map((p) => [p.entry.id, p.favourite])).toEqual([
      ['coin', true],
      ['door-creak', true],
      ['thunder', false],
    ]);
  });

  test('beds by group; an unknown group shows under Mood', () => {
    const beds = [entry('rain', 'bed', 'weather'), entry('odd', 'bed', 'space'), entry('tavern', 'bed', 'places')];
    expect(bedsOf(beds, 'weather').map((b) => b.id)).toEqual(['rain']);
    expect(bedsOf(beds, 'mood').map((b) => b.id)).toEqual(['odd']);
  });

  test('the summary line', () => {
    const name = (id: string) => id[0]!.toUpperCase() + id.slice(1);
    const s = defaultSoundscape();
    expect(soundLine(s, name)).toBe('Silent');
    expect(soundLine({ ...s, beds: [{ sound: 'rain', volume: 1 }] }, name)).toBe('Off — Rain ready');
    expect(soundLine({ ...s, on: true, beds: [{ sound: 'rain', volume: 1 }, { sound: 'campfire', volume: 1 }] }, name)).toBe('Playing: Rain, Campfire');
    expect(percent(0.7)).toBe('70 %');
  });
});

describe('the shipped library', () => {
  const root = join(import.meta.dir, '../../../../../..');
  const index = JSON.parse(readFileSync(join(root, 'assets/sounds/index.json'), 'utf8')) as unknown;
  const cat = makeCatalogue(index);
  const effects = new Set((JSON.parse(readFileSync(join(root, 'assets/effects/index.json'), 'utf8')) as { effects: Array<{ id: string }> }).effects.map((e) => e.id));

  test('beds and one-shots, every bed in a known group, ids unique', () => {
    expect(cat.beds.length).toBeGreaterThanOrEqual(10);
    expect(cat.oneShots.length).toBeGreaterThanOrEqual(10);
    const groups = new Set(BED_GROUPS.map((g) => g.id));
    for (const b of cat.beds) expect(groups.has(b.group)).toBe(true);
    expect(new Set(cat.sounds.map((s) => s.id)).size).toBe(cat.sounds.length);
  });

  test('every effects id a one-shot names exists in the effects library', () => {
    for (const s of cat.oneShots) for (const e of s.effects ?? []) expect(effects.has(e)).toBe(true);
    expect(cat.forEffect('fireball')?.id).toBe('fireball');
  });

  test('only licences fine for the table, CC-BY with its credit line; small files', () => {
    for (const s of cat.sounds) {
      expect(['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0']).toContain(s.licence.id);
      if (s.licence.id !== 'CC0-1.0') expect(s.attribution.length).toBeGreaterThan(0);
      expect(s.bytes).toBeLessThan(1024 * 1024);
      expect(Math.abs(s.samples - s.seconds * s.rate)).toBeLessThanOrEqual(s.rate / 1000); // seconds are rounded to ms
    }
    expect(cat.sounds.reduce((n, s) => n + s.bytes, 0)).toBeLessThan(40 * 1024 * 1024);
  });
});
