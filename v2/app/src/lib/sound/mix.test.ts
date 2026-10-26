/**
 * The mixer's rules: the volume taper, bed targets, the crossfade plan (start / ramp / stop,
 * stop all, a start after a stop), ducking, and the change signature.
 */
import { describe, expect, test } from 'bun:test';
import { defaultSoundscape, type Soundscape } from '@battlemap/shared';
import { bedTargets, DUCK_GAIN, duckGain, FADE, planMix, soundSignature, volumeGain } from './mix.ts';

const on = (beds: Soundscape['beds'], extra: Partial<Soundscape> = {}): Soundscape => ({ ...defaultSoundscape(), on: true, beds, ...extra });

describe('volumes', () => {
  test('the taper squares the slider and clamps', () => {
    expect(volumeGain(1)).toBe(1);
    expect(volumeGain(0.5)).toBe(0.25);
    expect(volumeGain(-1)).toBe(0);
    expect(volumeGain(2)).toBe(1);
    expect(volumeGain(Number.NaN)).toBe(0);
  });

  test('bed targets: nothing while off, else each bed tapered, in order', () => {
    expect(bedTargets({ ...on([{ sound: 'rain', volume: 1 }]), on: false }).size).toBe(0);
    expect([...bedTargets(on([{ sound: 'rain', volume: 0.5 }, { sound: 'wind', volume: 1 }]))]).toEqual([['rain', 0.25], ['wind', 1]]);
  });
});

describe('the plan', () => {
  test('a new bed starts with the bed fade; a changed one ramps; a gone one fades out', () => {
    const playing = new Map([['rain', 1], ['wind', 0.25]]);
    const plan = planMix(playing, on([{ sound: 'rain', volume: 0.5 }, { sound: 'tavern', volume: 1 }]), true);
    expect(plan.start).toEqual([{ sound: 'tavern', gain: 1, fade: FADE.bedIn }]);
    expect(plan.ramp).toEqual([{ sound: 'rain', gain: 0.25, fade: FADE.change }]);
    expect(plan.stop).toEqual([{ sound: 'wind', gain: 0, fade: FADE.bedOut }]);
  });

  test('a scene switch is a crossfade: every old bed out, every new one in', () => {
    const plan = planMix(new Map([['tavern', 1], ['campfire', 0.5]]), on([{ sound: 'storm', volume: 1 }, { sound: 'rain', volume: 1 }]), true);
    expect(plan.stop.map((c) => c.sound)).toEqual(['tavern', 'campfire']);
    expect(plan.start.map((c) => c.sound)).toEqual(['storm', 'rain']);
  });

  test('stop all fades every bed with the stop-all fade', () => {
    const plan = planMix(new Map([['rain', 1]]), { ...on([{ sound: 'rain', volume: 1 }]), on: false }, true);
    expect(plan).toEqual({ start: [], ramp: [], stop: [{ sound: 'rain', gain: 0, fade: FADE.stopAll }] });
  });

  test('play after a stop fades the beds in with the start fade; the same mix again is no change', () => {
    const s = on([{ sound: 'rain', volume: 1 }]);
    expect(planMix(new Map(), s, false).start).toEqual([{ sound: 'rain', gain: 1, fade: FADE.start }]);
    expect(planMix(new Map([['rain', 1]]), s, true)).toEqual({ start: [], ramp: [], stop: [] });
  });
});

describe('ducking and the signature', () => {
  test('beds duck while a ducking one-shot plays', () => {
    expect(duckGain(0)).toBe(1);
    expect(duckGain(2)).toBe(DUCK_GAIN);
  });

  test('the signature changes with any audible field', () => {
    const a = on([{ sound: 'rain', volume: 0.5 }]);
    expect(soundSignature(a)).toBe(soundSignature({ ...a }));
    expect(soundSignature(a)).not.toBe(soundSignature({ ...a, master: 0.5 }));
    expect(soundSignature(a)).not.toBe(soundSignature({ ...a, on: false }));
    expect(soundSignature(a)).not.toBe(soundSignature(on([{ sound: 'rain', volume: 0.6 }])));
    expect(soundSignature(null)).toBe('none');
  });
});
